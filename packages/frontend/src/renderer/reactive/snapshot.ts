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

function isPlainObjectForSnapshot(o: unknown): boolean {
  if (o === null || typeof o !== 'object') return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

function fallbackClone<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null) return value;
  if (typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      return undefined as unknown as T;
    return value;
  }
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (seen.has(value as object)) return seen.get(value as object) as T;
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(value as object, arr);
    for (let i = 0; i < (value as unknown[]).length; i++) {
      const cloned = fallbackClone((value as unknown[])[i], seen);
      arr[i] = cloned;
    }
    return arr as unknown as T;
  }
  // 非普通对象：浅拷贝可枚举自有属性为普通对象，避免 shared 引用
  if (!isPlainObjectForSnapshot(value)) {
    const out: Record<string, unknown> = {};
    seen.set(value as object, out);
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, k);
      if (!desc || desc.get || desc.set) continue;
      const raw = desc.value;
      if (typeof raw === 'function' || typeof raw === 'symbol') continue;
      out[k] = fallbackClone(raw, seen);
    }
    return out as unknown as T;
  }
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, k);
    if (!desc || desc.get || desc.set) continue;
    const raw = desc.value;
    if (typeof raw === 'function' || typeof raw === 'symbol') continue;
    out[k] = fallbackClone(raw, seen);
  }
  return out as unknown as T;
}

function cloneOrThrow<T extends Record<string, unknown>>(value: T, ns: string): T {
  try {
    return structuredClone(value);
  } catch (e) {
    // Fallback for non-cloneable values (functions/symbols/circular with functions): JSON-safe deep clone
    try {
      const fallback = fallbackClone(value);
      if (fallback !== undefined) return fallback;
    } catch {
      // ignore fallback error
    }
    throw new Error(`snapshot clone failed for ${ns}: ${(e as Error).message}`);
  }
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

    // data/state/formData: try { structuredClone } catch 抛错，再 deepFreeze
    const dataClone = cloneOrThrow(data, 'data');
    const stateClone = cloneOrThrow(state, 'state');
    const formDataClone = cloneOrThrow(formData, 'formData');
    deepFreeze(dataClone);
    deepFreeze(stateClone);
    deepFreeze(formDataClone);

    // components 保持浅拷贝浅冻结
    const componentsClone = shallowClone(components);
    Object.freeze(componentsClone);

    const snapshot: RuntimeSnapshot = {
      data: dataClone,
      state: stateClone,
      formData: formDataClone,
      components: componentsClone,
      version,
    };

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
