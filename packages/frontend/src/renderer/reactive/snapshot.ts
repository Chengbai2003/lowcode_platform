/**
 * SnapshotManager - React 的不可变运行时快照
 *
 * 创建运行时状态的时间点不可变视图，
 * 可在 React 渲染期间安全读取而不会产生副作用。
 * 兼容 useSyncExternalStore 的快照语义。
 *
 * @module renderer/reactive/snapshot
 */

import type { RuntimeSnapshot } from './types';

/**
 * 深度冻结对象以防止修改。
 * 只冻结普通对象和数组，忽略函数和原始值。
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 原始值已经是不可变的
  if (typeof obj !== 'object') {
    return obj;
  }

  // 不冻结函数、日期、正则等
  if (typeof obj === 'function') {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    Object.freeze(obj);
    obj.forEach((item) => deepFreeze(item));
    return obj;
  }

  // 处理普通对象
  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    // 不递归进入已冻结的对象（已经冻结）
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * 创建对象的浅拷贝，保留结构。
 * 用于在冻结前创建可变副本。
 */
function shallowClone<T extends Record<string, unknown>>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    clone[key] = (obj as Record<string, unknown>)[key];
  }
  return clone as T;
}

/**
 * SnapshotManager 处理不可变运行时快照的创建和缓存。
 *
 * 关键设计决策：
 * - 快照深度冻结以防止意外修改
 * - 版本追踪实现高效的变更检测
 * - 版本未变更时复用缓存的快照
 */
export class SnapshotManager {
  private cachedSnapshot: RuntimeSnapshot | null = null;
  private cachedVersion = -1;

  /**
   * 创建当前运行时状态的不可变快照。
   *
   * @param data - 组件业务数据
   * @param state - DSL 运行时状态
   * @param formData - 表单数据（保留命名空间）
   * @param components - Schema 组件池引用
   * @param version - 当前版本号
   * @returns 一个不可变的 RuntimeSnapshot
   */
  createSnapshot(
    data: Record<string, unknown>,
    state: Record<string, unknown>,
    formData: Record<string, unknown>,
    components: Record<string, unknown>,
    version: number,
  ): RuntimeSnapshot {
    // 如果版本未变更，返回缓存的快照
    if (this.cachedSnapshot !== null && this.cachedVersion === version) {
      return this.cachedSnapshot;
    }

    // 在冻结前创建浅拷贝，避免修改原始数据
    const snapshot: RuntimeSnapshot = {
      data: shallowClone(data),
      state: shallowClone(state),
      formData: shallowClone(formData),
      components: shallowClone(components),
      version,
    };

    // 深度冻结快照使其不可变
    deepFreeze(snapshot.data);
    deepFreeze(snapshot.state);
    deepFreeze(snapshot.formData);
    // 注意：components 引用通常与 schema 共享，
    // 我们浅冻结容器但不深度冻结 components
    Object.freeze(snapshot.components);
    Object.freeze(snapshot);

    // 缓存以供后续请求使用
    this.cachedSnapshot = snapshot;
    this.cachedVersion = version;

    return snapshot;
  }

  /**
   * 获取当前缓存的快照（如果有）。
   * 如果尚未创建快照则返回 null。
   */
  getCachedSnapshot(): RuntimeSnapshot | null {
    return this.cachedSnapshot;
  }

  /**
   * 获取缓存快照的版本。
   * 如果尚未创建快照则返回 -1。
   */
  getCachedVersion(): number {
    return this.cachedVersion;
  }

  /**
   * 使缓存快照失效。
   * 在下次请求时应创建新快照时调用。
   */
  invalidate(): void {
    this.cachedSnapshot = null;
    this.cachedVersion = -1;
  }

  /**
   * 检查脏路径是否影响计算节点的依赖。
   *
   * @param dirtyPaths - 已变更的路径，或 'all' 表示全量失效
   * @param deps - 要检查的依赖
   * @returns 如果任何依赖受脏路径影响则返回 true
   */
  isAffected(dirtyPaths: Set<string> | 'all', deps: Set<string>): boolean {
    // 'all' 表示全量失效
    if (dirtyPaths === 'all') {
      return true;
    }

    // 检查是否有依赖在脏集合中
    for (const dep of deps) {
      // 检查精确匹配
      if (dirtyPaths.has(dep)) {
        return true;
      }

      // 检查是否有脏路径是依赖的前缀
      // 例如：脏路径 "state" 影响 "state.loading"
      for (const dirtyPath of dirtyPaths) {
        if (dep.startsWith(dirtyPath + '.')) {
          return true;
        }
        // 同时检查依赖是否是脏路径的前缀
        // 例如：依赖 "data.user" 受 "data.user.name" 影响
        if (dirtyPath.startsWith(dep + '.')) {
          return true;
        }
      }
    }

    return false;
  }
}
