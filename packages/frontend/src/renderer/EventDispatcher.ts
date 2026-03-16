/**
 * 事件派发中心
 * 负责解析和执行 DSL Action 序列
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DSLExecutor } from './executor';
import type { ActionList, ExecutionContext } from '../types';
import {
  setComponentData,
  setComponentConfig,
  setMultipleComponentData,
} from './store/componentSlice';
import { ReactiveRuntime } from './reactive/runtime';
import { getFlag } from './featureFlags';

/**
 * 事件派发中心类
 */
export class EventDispatcher {
  private context: Record<string, any>;
  private dispatch: any;
  private getState: any;
  private dslExecutor: DSLExecutor;
  private executionContext: ExecutionContext;

  // 响应式订阅机制（Phase 1）
  private version = 0;
  private listeners = new Set<() => void>();
  private pendingChangedKeys: Set<string> | 'all' = new Set();
  private snapshots = new Map<number, ReadonlySet<string> | 'all'>();
  private static MAX_SNAPSHOTS = 50;
  private flushScheduled = false;
  private mergedCache = new Map<number, ReadonlySet<string> | 'all'>();

  /** ReactiveRuntime 实例 (Phase 1 - 根据 feature flag 条件启用) */
  private runtime: ReactiveRuntime | null = null;

  constructor(context: Record<string, any> = {}, dispatch: any, getState: any) {
    this.context = context;
    this.dispatch = dispatch;
    this.getState = getState;

    // 创建DSL执行引擎
    this.dslExecutor = new DSLExecutor({
      debug: process.env.NODE_ENV !== 'production',
      // 渲染器运行时保持 legacy customScript 可用，除非调用方显式禁用。
      enableCustomScript: context.enableCustomScript ?? true,
      onError: (error, action) => {
        console.error('[DSL Error]', error.message, { action });
      },
      onLog: (level, message, data) => {
        (console as any)[level](`[DSL ${level}]`, message, data);
      },
    });

    // 创建执行上下文
    this.executionContext = DSLExecutor.createContext({
      dispatch: this.dispatch,
      getState: this.getState,
      data: {}, // 组件数据
      formData: {}, // 表单数据
      setComponentData: (id: string, value: any) => {
        let dispatchError: unknown;
        try {
          this.dispatch(setComponentData({ id, value }));
        } catch (error) {
          dispatchError = error;
        }

        // 无论 dispatch 是否抛错，都尽力从 store 回读最终状态并同步 executionContext，
        // 覆盖"中间件在 next(action) 后抛错"这类部分成功场景。
        const syncedFromStore = this.syncComponentDataFromStore(id);
        if (!syncedFromStore && dispatchError == null) {
          this._writeComponentData(id, value);
        }

        if (dispatchError) {
          throw dispatchError;
        }
      },
      setComponentConfig: (id: string, config: any) => {
        this.dispatch(setComponentConfig({ id, config }));
      },
      markFullChange: () => this.markFullChange(),
      ...this.context,
    });

    // 初始化 ReactiveRuntime (根据 feature flag)
    // 注意：useReactiveRuntime 是新的 flag，默认关闭
    // reactiveContext 是旧 flag，用于响应式 context 订阅（已默认开启）
    if (getFlag('useReactiveRuntime')) {
      this.runtime = new ReactiveRuntime();
      this.runtime.initialize({
        data:
          this.executionContext.data && typeof this.executionContext.data === 'object'
            ? (this.executionContext.data as Record<string, unknown>)
            : undefined,
        state:
          this.executionContext.state && typeof this.executionContext.state === 'object'
            ? (this.executionContext.state as Record<string, unknown>)
            : undefined,
        formData:
          this.executionContext.formData && typeof this.executionContext.formData === 'object'
            ? (this.executionContext.formData as Record<string, unknown>)
            : undefined,
        components:
          this.executionContext.components && typeof this.executionContext.components === 'object'
            ? (this.executionContext.components as Record<string, unknown>)
            : undefined,
      });

      // Phase 2: runtime 作为主写链，flush 后再回填兼容层。
      this.runtime.subscribe(() => {
        this.syncCompatibilityStateFromRuntime();
      });
    }
  }

  /** 订阅 context 变化（符合 useSyncExternalStore 协议） */
  subscribe = (listener: () => void) => {
    // 如果 runtime 启用，优先使用 runtime 订阅（避免双重通知）
    if (this.runtime) {
      return this.runtime.subscribe(listener);
    }

    // 回退到传统订阅机制
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 获取当前版本号（useSyncExternalStore snapshot） */
  getVersion = () => {
    // 如果 runtime 启用，使用 runtime 的版本
    if (this.runtime) {
      return this.runtime.getVersion();
    }
    return this.version;
  };

  /** 组件按 version 查询变更集（不可变，无竞争） */
  getChangedKeysForVersion = (sinceVersion: number): ReadonlySet<string> | 'all' => {
    // 如果 runtime 启用，使用 runtime 的变更追踪
    if (this.runtime) {
      const dirtyPaths = this.runtime.getDirtyPaths(sinceVersion);
      if (dirtyPaths === 'all') return 'all';
      // 将 DataPath 转换为组件 ID（去掉命名空间前缀）
      const result = new Set<string>();
      for (const path of dirtyPaths) {
        // data.input1 -> input1, state.loading -> state.loading (保持原样)
        if (path.startsWith('data.')) {
          result.add(path.slice(5));
        } else {
          result.add(path);
        }
      }
      return result;
    }

    // 传统逻辑
    if (sinceVersion >= this.version) return new Set();

    const cached = this.mergedCache.get(sinceVersion);
    if (cached !== undefined) return cached;

    const merged = new Set<string>();
    for (let v = sinceVersion + 1; v <= this.version; v++) {
      const snap = this.snapshots.get(v);
      if (!snap || snap === 'all') {
        this.mergedCache.set(sinceVersion, 'all');
        return 'all';
      }
      for (const k of snap) merged.add(k);
    }
    const result: ReadonlySet<string> = merged;
    this.mergedCache.set(sinceVersion, result);
    return result;
  };

  private addPendingKey(key: string) {
    if (this.pendingChangedKeys !== 'all') {
      this.pendingChangedKeys.add(key);
    }
  }

  private setPendingAll() {
    this.pendingChangedKeys = 'all';
  }

  private scheduleFlush() {
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush() {
    this.flushScheduled = false;

    const pending = this.pendingChangedKeys;
    if (pending !== 'all' && pending.size === 0) return;

    this.version++;
    const frozen: ReadonlySet<string> | 'all' = pending === 'all' ? 'all' : new Set(pending);
    this.snapshots.set(this.version, frozen);

    if (this.snapshots.size > EventDispatcher.MAX_SNAPSHOTS) {
      const oldest = this.version - EventDispatcher.MAX_SNAPSHOTS;
      for (const key of this.snapshots.keys()) {
        if (key <= oldest) this.snapshots.delete(key);
      }
    }

    this.pendingChangedKeys = new Set();
    this.mergedCache.clear();

    this.listeners.forEach((fn) => fn());
  }

  /**
   * 将 runtime 的稳定结果镜像回 executionContext / Redux 兼容层。
   */
  private syncCompatibilityStateFromRuntime() {
    if (!this.runtime) {
      return;
    }

    const nextData = { ...this.runtime.getData() };
    const nextState = { ...this.runtime.getState() };
    const nextFormData = { ...this.runtime.getFormData() };
    const nextComponents = { ...this.runtime.getComponents() };

    this.executionContext = {
      ...this.executionContext,
      data: nextData,
      state: nextState,
      formData: nextFormData,
      components: nextComponents,
    };

    const storeData = this.getState?.()?.components?.data;
    if (this.isShallowEqualRecord(storeData, nextData)) {
      return;
    }

    try {
      this.dispatch(setMultipleComponentData(nextData));
    } catch (error) {
      console.warn('[EventDispatcher] Failed to mirror runtime snapshot to Redux bridge', {
        error,
      });
    }
  }

  private isShallowEqualRecord(
    left: unknown,
    right: Record<string, unknown>,
  ): left is Record<string, unknown> {
    if (!left || typeof left !== 'object') {
      return false;
    }

    const leftRecord = left as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of rightKeys) {
      if (!Object.is(leftRecord[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 内部统一写入：更新 executionContext.data + 累积 pendingKey + scheduleFlush
   * 同时写入 ReactiveRuntime (如果启用)
   */
  private _writeComponentData(componentId: string, value: any) {
    // Phase 2: 当功能开关启用时，仅使用 runtime 路径
    if (this.runtime && getFlag('useReactiveRuntime')) {
      const currentData = this.executionContext.data || {};
      this.executionContext = {
        ...this.executionContext,
        data: { ...currentData, [componentId]: value },
      };

      this.runtime.set(componentId, value);

      // Redux 在 Phase 2 仍作为兼容读桥，失败不应反向影响 runtime 主链。
      try {
        this.dispatch(setComponentData({ id: componentId, value }));
      } catch (error) {
        console.warn('[EventDispatcher] Failed to mirror runtime write to Redux bridge', {
          componentId,
          error,
        });
      }

      return; // 完成 - runtime 处理脏追踪和通知
    }

    // 1. 更新 executionContext (保持兼容)
    const currentData = this.executionContext.data || {};
    this.executionContext = {
      ...this.executionContext,
      data: { ...currentData, [componentId]: value },
    };

    // 2. 如果 runtime 存在但开关关闭，仍然写入（兼容模式）
    if (this.runtime) {
      this.runtime.set(componentId, value);
      return; // 跳过遗留 flush
    }

    // 3. 传统路径：累积 pendingKey 和调度 flush
    this.addPendingKey(componentId);
    this.scheduleFlush();
  }

  /**
   * 从 Redux store 回读组件数据并同步到 executionContext，保持双写路径一致性。
   * 同时同步到 ReactiveRuntime (如果启用)。
   * 返回 true 表示已成功回读并同步；false 表示无法从 store 读取。
   */
  private syncComponentDataFromStore(componentId: string): boolean {
    const state = this.getState?.();
    const storeData = state?.components?.data;
    if (!storeData || typeof storeData !== 'object') {
      return false;
    }

    const currentData = this.executionContext.data || {};
    const prevValue = currentData[componentId];
    const nextValue = (storeData as Record<string, any>)[componentId];

    if (!Object.is(prevValue, nextValue)) {
      // 1. 同步到 executionContext
      this.executionContext = {
        ...this.executionContext,
        data: { ...currentData, [componentId]: nextValue },
      };

      // 2. 同步到 runtime (如果启用)
      if (this.runtime) {
        this.runtime.set(componentId, nextValue);
        // runtime 启用时，跳过传统 flush 机制
        return true;
      }

      // 3. 传统路径：标记变更并调度 flush
      this.addPendingKey(componentId);
      this.scheduleFlush();
    }

    return true;
  }

  /** 标记为全量变更（用于无法精确追踪的写入路径） */
  markFullChange = () => {
    // 如果 runtime 启用，使用 runtime 的全量失效
    if (this.runtime) {
      this.runtime.markAllDirty();
      return;
    }
    this.setPendingAll();
    this.scheduleFlush();
  };

  /**
   * 更新执行上下文（不可变更新）
   */
  setContext(key: string, value: any) {
    if (Object.is(this.executionContext[key], value)) {
      return;
    }

    if (
      (key === 'data' || key === 'state' || key === 'formData' || key === 'components') &&
      value &&
      typeof value === 'object' &&
      this.isShallowEqualRecord(this.executionContext[key], value as Record<string, unknown>)
    ) {
      return;
    }

    this.context = { ...this.context, [key]: value };
    this.executionContext = { ...this.executionContext, [key]: value };

    // 同步到 runtime (如果启用且是数据相关的 key)
    if (this.runtime) {
      // data, state, formData 是 runtime 管理的命名空间
      if (key === 'data' || key === 'state' || key === 'formData') {
        if (typeof value === 'object' && value !== null) {
          this.runtime.setNamespace(key, value as Record<string, unknown>);
          return;
        }
      }

      if (key === 'components' && typeof value === 'object' && value !== null) {
        this.runtime.setComponents(value as Record<string, unknown>);
        return;
      }
    }

    this.setPendingAll();
    this.scheduleFlush();
  }

  /**
   * 更新组件数据到执行上下文（不可变更新）
   */
  updateComponentData(componentId: string, value: any) {
    this._writeComponentData(componentId, value);
  }

  /**
   * 执行 DSL Action 序列
   */
  async execute(actions: ActionList, event?: Event | any): Promise<any> {
    try {
      // 将事件对象添加到上下文
      const contextWithEvent: ExecutionContext = {
        ...this.getExecutionContext(),
        event,
      };

      // 执行DSL
      const result = await this.dslExecutor.execute(actions, contextWithEvent);
      return result;
    } catch (error) {
      console.error('[EventDispatcher] DSL execution failed:', error);
      throw error;
    }
  }

  /**
   * 创建事件处理器（同步版本，用于React事件绑定）
   */
  createHandler(actions: ActionList) {
    return (event: any) => {
      // 异步执行，不等待结果
      this.execute(actions, event).catch((error) => {
        console.error('[EventDispatcher] Handler execution failed:', error);
      });
    };
  }

  /**
   * 获取DSL执行引擎实例
   */
  getExecutor(): DSLExecutor {
    return this.dslExecutor;
  }

  /**
   * 获取当前执行上下文
   */
  getExecutionContext(): ExecutionContext {
    if (!this.runtime) {
      return this.executionContext;
    }

    return {
      ...this.executionContext,
      data: { ...this.runtime.getData() },
      state: { ...this.runtime.getState() },
      formData: { ...this.runtime.getFormData() },
      components: { ...this.runtime.getComponents() },
      // 为 action handler 添加 runtime 引用（Phase 2）
      runtime: this.runtime || undefined,
    };
  }

  /**
   * 获取 ReactiveRuntime 实例 (Phase 1)
   * @returns ReactiveRuntime 实例，如果未启用则返回 null
   */
  getRuntime(): ReactiveRuntime | null {
    return this.runtime;
  }
}
