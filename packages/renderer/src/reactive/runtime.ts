/**
 * ReactiveRuntime - 渲染器的核心响应式运行时
 *
 * 所有运行时数据的唯一数据源，具有：
 * - 统一的写入 API（set, patch, batch）
 * - 兼容 useSyncExternalStore 的订阅系统
 * - 基于代理的依赖追踪
 * - 基于微任务的批量通知
 *
 * @module renderer/reactive/runtime
 */

import type {
  DataPath,
  DirtyPaths,
  RuntimeSnapshot,
  SubscriptionListener,
  Unsubscribe,
} from './types';
import { TrackingScope, createTrackingProxy } from './tracking';
import { FlushScheduler } from './flush';
import { SnapshotManager } from './snapshot';
import { getValueByPath, normalizeDeps, normalizePath, parsePath, setValueByPath } from './path';
import { assertSafePath } from './guards';
import type { ComputedLogicAnalysis } from '@lowcode-platform/schema-contract';
import { ComputedStore } from './computedStore';

// 保持向后兼容：历史入口 `import { isSafeKey } from './runtime'` 仍可用
export { isSafeKey } from './guards';

/**
 * ReactiveRuntime 是渲染器的核心响应式运行时。
 *
 * 设计原则：
 * - 单一数据源：所有运行时数据存放在一处
 * - 写入是同步的：set() 立即写入
 * - 通知是批量的：通过微任务通知订阅者
 * - 快照是不可变的：React 渲染阶段安全
 * - 追踪代理是只读的：收集依赖而不修改
 */
export class ReactiveRuntime {
  private static MAX_DIRTY_HISTORY = 50;

  // === 内部状态 ===
  private data: Record<string, unknown> = {};
  private state: Record<string, unknown> = {};
  private formData: Record<string, unknown> = {};
  private components: Record<string, unknown> = {};
  private computedStore = new ComputedStore();

  private dirtyPaths: DirtyPaths = new Set<DataPath>();
  private version = 0;
  private dirtyHistory = new Map<number, DirtyPaths>();
  private mergedDirtyCache = new Map<number, DirtyPaths>();
  private flushScheduled = false;

  // === 订阅管理 ===
  private listeners = new Set<SubscriptionListener>();
  private computedListeners = new Map<string, { listener: () => void; deps: Set<DataPath> }>();

  // === 支撑服务 ===
  private flushScheduler: FlushScheduler;
  private snapshotManager: SnapshotManager;
  private trackingScope: TrackingScope;

  constructor() {
    this.flushScheduler = new FlushScheduler();
    this.snapshotManager = new SnapshotManager();
    this.trackingScope = new TrackingScope();
  }

  // ========================================
  // 核心数据 API
  // ========================================

  /**
   * 通过路径获取值。
   *
   * @param path - 数据路径（例如 "input1", "state.loading", "data.input1"）
   * @returns 路径处的值，如果未找到则返回 undefined
   */
  get(path: DataPath): unknown {
    const { namespace, rest } = parsePath(path);

    let target: Record<string, unknown>;
    switch (namespace) {
      case 'data':
        target = this.data;
        break;
      case 'state':
        target = this.state;
        break;
      case 'computed':
        target = this.getComputed() as Record<string, unknown>;
        break;
      case 'formData':
        target = this.formData;
        break;
      case 'components':
        target = this.components;
        break;
      default:
        return undefined;
    }

    return getValueByPath(target, rest);
  }

  /**
   * 通过路径设置值，触发 flush。
   *
   * @param path - 数据路径（例如 "input1", "state.loading", "data.input1"）
   * @param value - 要设置的值
   */
  set(path: DataPath, value: unknown): void {
    if (path.startsWith('computed.')) {
      throw new Error(`[ReactiveRuntime] Computed path "${path}" is read-only`);
    }
    assertSafePath(path);
    const { namespace, rest } = parsePath(path);

    let target: Record<string, unknown>;
    switch (namespace) {
      case 'data':
        target = this.data;
        break;
      case 'state':
        target = this.state;
        break;
      case 'formData':
        target = this.formData;
        break;
      case 'components':
        target = this.components;
        break;
      default:
        console.warn(`[ReactiveRuntime] 未知命名空间: ${namespace}`);
        return;
    }

    setValueByPath(target, rest, value);

    // 标记脏路径
    this.markDirty(path);
    if (namespace === 'state') {
      this.markComputedDirty(this.computedStore.invalidateStateKey(rest.split('.')[0]));
    }

    // 调度 flush
    this.scheduleFlush();
  }

  /**
   * 批量更新，单次通知。
   *
   * @param fn - 包含多个 set/patch 调用的函数
   */
  batch(fn: () => void): void {
    this.flushScheduler.enterBatch();
    try {
      fn();
    } finally {
      this.flushScheduler.exitBatch();
    }
  }

  /**
   * 一次性应用多个更新。
   *
   * @param updates - 路径到值的映射对象
   */
  patch(updates: Record<string, unknown>): void {
    this.batch(() => {
      for (const [path, value] of Object.entries(updates)) {
        this.set(path, value);
      }
    });
  }

  // ========================================
  // 订阅 API（兼容 useSyncExternalStore）
  // ========================================

  /**
   * 订阅所有变更。
   *
   * @param listener - 状态变更时调用的回调
   * @returns 取消订阅函数
   */
  subscribe(listener: SubscriptionListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 订阅计算节点变更。
   *
   * @param nodeId - 计算节点的唯一标识符
   * @param listener - 依赖变更时调用的回调
   * @param deps - 可选的显式依赖（如果未提供则自动追踪）
   * @returns 取消订阅函数
   */
  subscribeComputed(
    nodeId: string,
    listener: SubscriptionListener,
    deps?: Set<DataPath>,
  ): Unsubscribe {
    const computedListener = {
      listener,
      deps: normalizeDeps(deps) ?? new Set<DataPath>(),
    };

    this.computedListeners.set(nodeId, computedListener);

    return () => {
      this.computedListeners.delete(nodeId);
    };
  }

  /**
   * 更新已注册计算节点的依赖集合。
   */
  updateComputedDeps(nodeId: string, deps: Set<DataPath>): void {
    const computedListener = this.computedListeners.get(nodeId);
    if (!computedListener) {
      return;
    }

    computedListener.deps = normalizeDeps(deps) ?? new Set<DataPath>();
  }

  /**
   * 获取当前版本用于快照比较。
   * 由 useSyncExternalStore 的 getServerSnapshot 使用。
   *
   * @returns 当前版本号
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * 获取 React 的不可变快照。
   * 由 useSyncExternalStore 的 getSnapshot 使用。
   *
   * @returns 不可变的 RuntimeSnapshot
   */
  getSnapshot(): RuntimeSnapshot {
    return this.snapshotManager.createSnapshot(
      this.data,
      this.state,
      this.formData,
      this.components,
      this.version,
      this.getComputed(),
    );
  }

  // ========================================
  // 追踪 API
  // ========================================

  /**
   * 开始追踪依赖。
   * 调用 stopTracking() 获取收集的依赖。
   */
  startTracking(): void {
    this.trackingScope.start();
  }

  /**
   * 停止追踪并返回收集的依赖。
   *
   * @returns 追踪期间访问的路径集合
   */
  stopTracking(): Set<DataPath> {
    return this.trackingScope.stop();
  }

  /**
   * 检查当前是否已有外层追踪会话在运行。
   */
  isTrackingActive(): boolean {
    return this.trackingScope.isActive();
  }

  /**
   * 创建用于表达式求值的追踪代理。
   * 提供对运行时数据的只读访问并收集依赖。
   *
   * @returns 追踪属性访问的代理对象
   */
  createTrackingProxy(): Record<string, unknown> {
    const tracker = (path: string) => {
      this.trackingScope.track(path);
    };

    // 创建匹配数据命名空间的嵌套代理结构
    const proxyData = {
      data: createTrackingProxy(this.data, (p) => tracker(`data.${p}`)),
      state: createTrackingProxy(this.state, (p) => tracker(`state.${p}`)),
      computed: createTrackingProxy(this.getComputed() as Record<string, unknown>, (p) =>
        tracker(`computed.${p}`),
      ),
      formData: createTrackingProxy(this.formData, (p) => tracker(`formData.${p}`)),
      components: createTrackingProxy(this.components, (p) => tracker(`components.${p}`)),
    };

    // 同时暴露顶层别名（例如 "input1" -> data.input1）
    return new Proxy(proxyData as Record<string, unknown>, {
      get(target, property): unknown {
        // 处理 symbol 访问
        if (typeof property === 'symbol') {
          return (target as any)[property];
        }

        // 首先检查显式命名空间
        if (property in target) {
          return target[property];
        }

        // 视为隐式 data 命名空间访问
        // 这允许通过 proxy.input1 而不是 proxy.data.input1 访问 input1
        const dataProxy = target.data as Record<string, unknown>;
        return dataProxy[property];
      },

      set(_target, _property, _value): boolean {
        throw new Error(
          `[ReactiveRuntime] 无法设置属性 "${String(_property)}" - 追踪代理是只读的。请使用 runtime.set()。`,
        );
      },

      has(target, property): boolean {
        if (typeof property === 'symbol') {
          return property in target;
        }
        return property in target || property in (target.data as object);
      },
    });
  }

  // ========================================
  // 内部方法
  // ========================================

  /**
   * 标记路径为脏。
   * 添加到脏集合或在需要时升级为 'all'。
   */
  private markDirty(path: DataPath): void {
    // 如果已经是全量失效则不标记
    if (this.dirtyPaths === 'all') {
      return;
    }

    (this.dirtyPaths as Set<DataPath>).add(normalizePath(path));
  }

  /**
   * 调度 flush 以通知订阅者。
   * 每个批处理周期只调度一次。
   */
  private scheduleFlush(): void {
    if (this.flushScheduled) {
      return;
    }

    this.flushScheduled = true;
    this.flushScheduler.schedule(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  /**
   * Flush 变更到订阅者。
   * 递增版本、创建快照、通知监听器。
   */
  private flush(): void {
    const dirtySnapshot: DirtyPaths = this.dirtyPaths === 'all' ? 'all' : new Set(this.dirtyPaths);

    // 递增版本
    this.version++;
    this.dirtyHistory.set(this.version, dirtySnapshot);

    if (this.dirtyHistory.size > ReactiveRuntime.MAX_DIRTY_HISTORY) {
      const oldest = this.version - ReactiveRuntime.MAX_DIRTY_HISTORY;
      for (const key of this.dirtyHistory.keys()) {
        if (key <= oldest) this.dirtyHistory.delete(key);
      }
    }

    this.mergedDirtyCache.clear();

    // 通知受脏路径影响的计算监听器
    this.notifyComputedListeners();

    // 通知全局监听器
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[ReactiveRuntime] 监听器错误:', error);
      }
    }

    // flush 后清除脏路径
    this.dirtyPaths = new Set<DataPath>();
  }

  /**
   * 通知依赖已变更的计算监听器。
   */
  private notifyComputedListeners(): void {
    if (this.dirtyPaths === 'all') {
      // 全量失效：通知所有计算监听器
      for (const { listener } of this.computedListeners.values()) {
        try {
          listener();
        } catch (error) {
          console.error('[ReactiveRuntime] 计算监听器错误:', error);
        }
      }
      return;
    }

    // 检查每个计算监听器的依赖
    for (const [nodeId, { listener, deps }] of this.computedListeners) {
      if (deps.size === 0) {
        // 没有显式依赖，始终通知
        try {
          listener();
        } catch (error) {
          console.error(`[ReactiveRuntime] 计算监听器错误 (${nodeId}):`, error);
        }
        continue;
      }

      // 检查是否有任何依赖受影响
      if (this.snapshotManager.isAffected(this.dirtyPaths, deps)) {
        try {
          listener();
        } catch (error) {
          console.error(`[ReactiveRuntime] 计算监听器错误 (${nodeId}):`, error);
        }
      }
    }
  }

  // ========================================
  // 工具方法
  // ========================================

  /**
   * 获取当前脏路径（用于调试）。
   */
  getDirtyPaths(): DirtyPaths;

  /**
   * 获取自特定版本以来的脏路径。
   * 目前返回当前脏路径（简单实现）。
   */
  getDirtyPaths(sinceVersion: number): DirtyPaths;

  getDirtyPaths(sinceVersion?: number): DirtyPaths {
    if (sinceVersion === undefined) {
      return this.dirtyPaths;
    }

    if (sinceVersion >= this.version) {
      return new Set<DataPath>();
    }

    const cached = this.mergedDirtyCache.get(sinceVersion);
    if (cached !== undefined) {
      return cached;
    }

    const merged = new Set<DataPath>();
    for (let version = sinceVersion + 1; version <= this.version; version++) {
      const snapshot = this.dirtyHistory.get(version);
      if (!snapshot || snapshot === 'all') {
        this.mergedDirtyCache.set(sinceVersion, 'all');
        return 'all';
      }
      for (const path of snapshot) {
        merged.add(path);
      }
    }

    const result: DirtyPaths = merged;
    this.mergedDirtyCache.set(sinceVersion, result);
    return result;
  }

  /**
   * 检查运行时当前是否有未 flush 的脏路径。
   */
  hasPendingChanges(): boolean {
    return this.dirtyPaths === 'all' || this.dirtyPaths.size > 0;
  }

  /**
   * 检查 components 命名空间是否已初始化。
   */
  hasComponents(): boolean {
    return Object.keys(this.components).length > 0;
  }

  /**
   * 检查命名空间是否已有数据。
   */
  hasNamespaceData(namespace: 'data' | 'state' | 'formData'): boolean {
    switch (namespace) {
      case 'data':
        return Object.keys(this.data).length > 0;
      case 'state':
        return Object.keys(this.state).length > 0;
      case 'formData':
        return Object.keys(this.formData).length > 0;
      default:
        return false;
    }
  }

  /**
   * 在初始化或兼容性同步期间设置整个命名空间。
   *
   * 这会替换命名空间内容，而不是逐字段修补。
   */
  setNamespace(
    namespace: 'data' | 'state' | 'formData',
    value: Record<string, unknown>,
    options?: { notify?: boolean },
  ): void {
    const nextValue = { ...value };
    switch (namespace) {
      case 'data':
        this.data = nextValue;
        break;
      case 'state':
        this.state = nextValue;
        this.computedStore.invalidateAll();
        break;
      case 'formData':
        this.formData = nextValue;
        break;
    }

    if (options?.notify !== false) {
      this.markAllDirty();
    }
  }

  /**
   * 替换完整的组件池。
   */
  setComponents(components: Record<string, unknown>, options?: { notify?: boolean }): void {
    this.components = components;

    if (options?.notify !== false) {
      this.markAllDirty();
    }
  }

  /**
   * 使用初始命名空间初始化运行时。
   */
  initialize(options?: {
    data?: Record<string, unknown>;
    state?: Record<string, unknown>;
    formData?: Record<string, unknown>;
    components?: Record<string, unknown>;
  }): void {
    const { data, state, formData, components } = options ?? {};

    this.data = data ? { ...data } : {};
    this.state = state ? { ...state } : {};
    this.formData = formData ? { ...formData } : {};
    this.components = components ? { ...components } : {};
    this.computedStore.clear();

    // 重置版本状态和缓存快照，因为这是全新的基准。
    this.version = 0;
    this.dirtyPaths = new Set<DataPath>();
    this.dirtyHistory.clear();
    this.mergedDirtyCache.clear();
    this.flushScheduler.clear();
    this.snapshotManager.invalidate();
    this.flushScheduled = false;
  }

  /**
   * 获取原始表单数据（仅用于调试，请勿修改）。
   */
  getFormData(): Record<string, unknown> {
    return this.formData;
  }

  /**
   * 获取原始组件（仅用于调试，请勿修改）。
   */
  getComponents(): Record<string, unknown> {
    return this.components;
  }

  /**
   * 获取脏历史大小（仅用于调试）。
   */
  getDirtyHistorySize(): number {
    return this.dirtyHistory.size;
  }

  /**
   * 获取当前脏路径（用于调试）。
   */
  getCurrentDirtyPaths(): DirtyPaths {
    return this.dirtyPaths;
  }

  /**
   * 检查当前是否在批处理模式。
   */
  isInBatch(): boolean {
    return this.flushScheduler.getBatchDepth() > 0;
  }

  /**
   * 强制立即 flush（谨慎使用）。
   */
  forceFlush(): void {
    this.flushScheduler.flush();
  }

  /**
   * 标记所有路径为脏（全量失效）。
   * 用于无法精确追踪变更时。
   */
  markAllDirty(): void {
    this.dirtyPaths = 'all';
    this.scheduleFlush();
  }

  /**
   * 清除所有数据（用于测试/重置）。
   */
  clear(): void {
    this.data = {};
    this.state = {};
    this.formData = {};
    this.components = {};
    this.computedStore.clear();
    this.dirtyPaths = new Set<DataPath>();
    this.version = 0;
    this.dirtyHistory.clear();
    this.mergedDirtyCache.clear();
    this.listeners.clear();
    this.computedListeners.clear();
    this.flushScheduler.clear();
    this.snapshotManager.invalidate();
    this.flushScheduled = false;
  }

  /**
   * 获取原始数据（仅用于调试，请勿修改）。
   */
  getData(): Record<string, unknown> {
    return this.data;
  }

  /**
   * 获取原始状态（仅用于调试，请勿修改）。
   */
  getState(): Record<string, unknown> {
    return this.state;
  }

  /** 读取当前只读 Computed 命名空间；脏节点会按 Contract 拓扑同步重算。 */
  getComputed(): Readonly<Record<string, unknown>> {
    return this.computedStore.read(this.state);
  }

  /** 在当前 Session 中原子替换 Computed 声明图，不重置 State。 */
  configureComputed(
    analysis: ComputedLogicAnalysis | undefined,
    options?: { notify?: boolean },
  ): void {
    const changedKeys = this.computedStore.configure(analysis);
    if (changedKeys.size > 0) this.snapshotManager.invalidate();
    if (options?.notify === false || changedKeys.size === 0) return;
    this.markComputedDirty(changedKeys);
    this.scheduleFlush();
  }

  /** 清理 Session 私有 Computed 图与缓存。 */
  clearComputed(options?: { notify?: boolean }): void {
    const removedKeys = this.computedStore.configure(undefined);
    if (removedKeys.size > 0) this.snapshotManager.invalidate();
    if (options?.notify === false || removedKeys.size === 0) return;
    this.markComputedDirty(removedKeys);
    this.scheduleFlush();
  }

  private markComputedDirty(keys: Iterable<string>): void {
    for (const key of keys) this.markDirty(`computed.${key}`);
  }
}
