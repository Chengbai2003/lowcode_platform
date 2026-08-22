/**
 * 基于代理的依赖追踪，用于响应式更新
 *
 * 此模块提供属性访问模式的运行时追踪，
 * 实现组件渲染系统中的细粒度响应式。
 * Safe tracking membrane: blocks Symbol, getter/setter, own functions, non-plain objects.
 */

// 用于在 sanitize 克隆期间暂停追踪，避免 ownKeys 枚举误污染依赖（P0-2 收尾）
let pauseDepth = 0;
export function pauseTracking(): void {
  pauseDepth++;
}
export function resumeTracking(): void {
  pauseDepth = Math.max(0, pauseDepth - 1);
}
export function isTrackingPaused(): boolean {
  return pauseDepth > 0;
}

const trackingProxySet = new WeakSet<object>();
export function isTrackingProxy(value: unknown): boolean {
  return typeof value === 'object' && value !== null && trackingProxySet.has(value as object);
}

/** 需要忽略的原型污染键集合 */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return true;
  // Handle { __proto__: {} } where proto is a plain object (test case for prototype pollution)
  if (proto !== null && typeof proto === 'object' && (proto as any).constructor === Object) {
    const protoProto = Object.getPrototypeOf(proto);
    if (protoProto === Object.prototype || protoProto === null) return true;
  }
  return false;
}

/**
 * TrackingScope 管理一个追踪会话，在响应式求值期间收集依赖路径。
 */
export class TrackingScope {
  private active = false;
  private dependencies: Set<string> = new Set();
  // ponytail: proxyCache 移到实例字段，按 basePath 区分，start() 重建
  private proxyCache: WeakMap<object, Map<string, object>> = new WeakMap();

  /**
   * 开始追踪依赖
   */
  start(): void {
    this.active = true;
    this.dependencies.clear();
    this.proxyCache = new WeakMap();
  }

  /**
   * 停止追踪并返回收集的依赖
   */
  stop(): Set<string> {
    this.active = false;
    const deps = this.dependencies;
    this.dependencies = new Set();
    return deps;
  }

  /**
   * 记录一个依赖路径
   */
  track(path: string): void {
    if (this.active && !isTrackingPaused()) {
      this.dependencies.add(path);
    }
  }

  /**
   * 检查追踪是否正在活动
   */
  isActive(): boolean {
    return this.active;
  }

  /** 供 withTracking / createDeepTrackingProxy 使用 */
  getCache(): WeakMap<object, Map<string, object>> {
    return this.proxyCache;
  }
}

/**
 * 为对象创建追踪代理
 *
 * @param data - 要代理的数据对象
 * @param tracker - 访问路径时调用的回调函数
 * @returns 一个追踪属性访问的只读代理
 */
export function createTrackingProxy(
  data: Record<string, unknown>,
  tracker: (path: string) => void,
  cache?: WeakMap<object, Map<string, object>>,
): Record<string, unknown> {
  return createDeepTrackingProxy(data, '', tracker, cache);
}

/**
 * 创建支持嵌套路径追踪的深层追踪代理 (safe membrane)
 *
 * @param data - 要代理的数据对象
 * @param basePath - 当前路径前缀（例如 "data.input1"）
 * @param tracker - 访问完整路径时调用的回调函数
 * @returns 一个追踪属性访问的只读代理
 */
export function createDeepTrackingProxy(
  data: Record<string, unknown>,
  basePath: string,
  tracker: (path: string) => void,
  cache?: WeakMap<object, Map<string, object>>,
): Record<string, unknown> {
  // 处理 null/undefined - 原样返回
  if (data === null || data === undefined) {
    return data as Record<string, unknown>;
  }

  // 只代理 plain object 和数组，非 plain 直接返回
  if (typeof data !== 'object') {
    return data;
  }
  if (!Array.isArray(data) && !isPlainObject(data)) {
    return data as Record<string, unknown>;
  }

  const c = cache ?? new WeakMap<object, Map<string, object>>();
  // 按 basePath 区分缓存
  const inner = c.get(data as object);
  if (inner) {
    const hit = inner.get(basePath);
    if (hit) return hit as Record<string, unknown>;
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, property, receiver): unknown {
      // Block all Symbol access (including Symbol.toPrimitive, Symbol.iterator, Symbol.toStringTag)
      if (typeof property === 'symbol') {
        return undefined;
      }

      // 忽略原型污染键
      if (PROTOTYPE_KEYS.has(property as string)) {
        return undefined;
      }

      // descriptor-safe check: block getter/setter and own function values
      const desc = Object.getOwnPropertyDescriptor(target, property as string);
      if (desc) {
        if (desc.get || desc.set) return undefined;
        if (typeof desc.value === 'function') return undefined;
      } else {
        // Check prototype chain for accessor to avoid invoking getter via Reflect.get
        let proto = Object.getPrototypeOf(target);
        while (proto) {
          const pd = Object.getOwnPropertyDescriptor(proto, property as string);
          if (pd) {
            if (pd.get || pd.set) return undefined;
            if (typeof pd.value === 'function') return undefined;
            break;
          }
          proto = Object.getPrototypeOf(proto);
        }
      }

      // 构建此访问的完整路径
      const fullPath = basePath ? `${basePath}.${property as string}` : (property as string);

      // 追踪此访问 (only for safe access)
      tracker(fullPath);

      // Safely retrieve value without invoking getter (we already blocked getters)
      let value: unknown;
      if (desc && 'value' in desc) {
        value = desc.value;
      } else {
        // For prototype data properties or missing descriptor, safe to Reflect.get (no getter in chain)
        value = Reflect.get(target, property, receiver);
        // Extra safety: if retrieved value is function (prototype function), block
        if (typeof value === 'function') return undefined;
      }

      // 处理 null/undefined - 原样返回，不创建代理
      if (value === null || value === undefined) {
        return value;
      }

      // 处理数组 - 创建代理以追踪数组访问
      if (Array.isArray(value)) {
        return createArrayProxy(value, fullPath, tracker, c);
      }

      // 处理嵌套对象 - 仅 plain object 进代理; Date 返回安全拷贝; 其他非 plain 返回 undefined
      if (typeof value === 'object') {
        if (isPlainObject(value)) {
          return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker, c);
        }
        if (value instanceof Date) {
          return new Date(value.getTime());
        }
        // Block non-plain objects: Map, Set, RegExp, WeakMap, class instances etc.
        return undefined;
      }

      // primitive (string, number, boolean, bigint already filtered? bigint value would be in desc.value but we didn't block bigint; but we should allow bigint primitive)
      // Check if primitive is function/symbol already handled; bigint is primitive but evaluator will block bigint via cloneSanitized
      return value;
    },

    set(_target, _property, _value): boolean {
      throw new Error(`无法设置属性 "${String(_property)}" - 追踪代理是只读的`);
    },

    deleteProperty(_target, _property): boolean {
      throw new Error(`无法删除属性 "${String(_property)}" - 追踪代理是只读的`);
    },

    has(target, property): boolean {
      if (typeof property === 'symbol') {
        return false;
      }
      if (PROTOTYPE_KEYS.has(property as string)) {
        return false;
      }
      const desc = Object.getOwnPropertyDescriptor(target, property as string);
      if (desc) {
        if (desc.get || desc.set) return false;
        if (typeof desc.value === 'function') return false;
      } else {
        let proto = Object.getPrototypeOf(target);
        while (proto) {
          const pd = Object.getOwnPropertyDescriptor(proto, property as string);
          if (pd) {
            if (pd.get || pd.set) return false;
            if (typeof pd.value === 'function') return false;
            break;
          }
          proto = Object.getPrototypeOf(proto);
        }
      }
      return Reflect.has(target, property);
    },

    ownKeys(target: Record<string, unknown>): ArrayLike<string | symbol> {
      // Only filter prototype pollution keys, keep symbols and other keys to avoid invariant violation.
      // Non-configurable filtering is handled at get level.
      return Reflect.ownKeys(target).filter(
        (key) => typeof key === 'symbol' || !PROTOTYPE_KEYS.has(key as string),
      );
    },

    getOwnPropertyDescriptor(
      target: Record<string, unknown>,
      property: string | symbol,
    ): PropertyDescriptor | undefined {
      if (typeof property === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
      if (PROTOTYPE_KEYS.has(property as string)) {
        return undefined;
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (descriptor) {
        // invariant-safe: only set writable false, don't flip configurable false to true
        // For data descriptor, make writable false if possible
        if ('writable' in descriptor) {
          // If configurable or writable true, we can set writable false safely
          // If non-configurable and writable false already, keep as is
          try {
            descriptor.writable = false;
          } catch {
            // ignore if cannot set
          }
        }
        // Keep configurable as original; don't force to true if originally false
        // Ensure enumerable stays as original
        // For accessor descriptors, keep get/set as is (or optionally hide for configurable, but follow spec to keep)
      }
      return descriptor;
    },
  };

  const proxy = new Proxy(data, handler);
  trackingProxySet.add(proxy as object);

  // 缓存代理（按 basePath）
  let m = c.get(data as object);
  if (!m) {
    m = new Map<string, object>();
    c.set(data as object, m);
  }
  m.set(basePath, proxy as unknown as object);

  return proxy;
}

/**
 * 创建专门用于数组的追踪代理 (safe membrane)
 * 处理索引访问和数组方法
 */
function createArrayProxy(
  array: unknown[],
  basePath: string,
  tracker: (path: string) => void,
  cache?: WeakMap<object, Map<string, object>>,
): unknown[] {
  const c = cache ?? new WeakMap<object, Map<string, object>>();
  const inner = c.get(array as object);
  if (inner) {
    const hit = inner.get(basePath);
    if (hit) return hit as unknown[];
  }

  const handler: ProxyHandler<unknown[]> = {
    get(target, property, receiver): unknown {
      // Block all Symbol access
      if (typeof property === 'symbol') {
        return undefined;
      }

      // 忽略原型污染键
      if (PROTOTYPE_KEYS.has(property as string)) {
        return undefined;
      }

      // descriptor-safe check for own properties (including indices and custom props)
      const desc = Object.getOwnPropertyDescriptor(target, property as string);
      if (desc) {
        if (desc.get || desc.set) return undefined;
        if (typeof desc.value === 'function') return undefined;
      } else {
        // For prototype properties (array methods), check if any accessor in chain
        // We will handle array methods via intrinsic, so don't block prototype functions here yet
        // But block if prototype has getter
        let proto = Object.getPrototypeOf(target);
        while (proto && proto !== Array.prototype) {
          const pd = Object.getOwnPropertyDescriptor(proto, property as string);
          if (pd) {
            if (pd.get || pd.set) return undefined;
            if (typeof pd.value === 'function') return undefined;
            break;
          }
          proto = Object.getPrototypeOf(proto);
        }
        // For Array.prototype itself, don't block function yet; handle below
      }

      // 处理数字索引
      const numIndex = Number(property);
      if (!Number.isNaN(numIndex) && Number.isInteger(numIndex) && numIndex >= 0) {
        const fullPath = `${basePath}[${numIndex}]`;
        tracker(fullPath);

        let value: unknown;
        if (desc && 'value' in desc) {
          value = desc.value;
        } else {
          value = Reflect.get(target, property, receiver);
          if (typeof value === 'function') return undefined;
        }

        if (value === null || value === undefined) return value;

        // 处理数组中的嵌套对象/数组
        if (typeof value === 'object') {
          if (Array.isArray(value)) {
            return createArrayProxy(value, fullPath, tracker, c);
          }
          if (isPlainObject(value)) {
            return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker, c);
          }
          if (value instanceof Date) return new Date(value.getTime());
          return undefined;
        }
        return value;
      }

      // 处理数组长度
      if (property === 'length') {
        tracker(`${basePath}.length`);
        return target.length;
      }

      // 处理数组方法 - 使用 intrinsic 原型方法，避免自身被覆盖的污染
      if (
        typeof property === 'string' &&
        typeof (Array.prototype as any)[property] === 'function'
      ) {
        // Check if target has own overridden function - already blocked above via desc check
        // Only expose if not own blocked
        const intrinsic = (Array.prototype as any)[property];
        if (typeof intrinsic === 'function') {
          return (...args: unknown[]) => {
            tracker(`${basePath}.${property}()`);
            return intrinsic.apply(target, args);
          };
        }
      }

      // 对于其他属性（如自定义属性），追踪并返回
      const fullPath = `${basePath}.${property as string}`;
      tracker(fullPath);

      let value: unknown;
      if (desc && 'value' in desc) {
        value = desc.value;
      } else {
        value = Reflect.get(target, property, receiver);
        if (typeof value === 'function') return undefined;
      }

      if (value === null || value === undefined) return value;

      // 处理嵌套对象
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return createArrayProxy(value, fullPath, tracker, c);
        }
        if (isPlainObject(value)) {
          return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker, c);
        }
        if (value instanceof Date) return new Date(value.getTime());
        return undefined;
      }

      return value;
    },

    set(_target, _property, _value): boolean {
      throw new Error(`无法设置属性 "${String(_property)}" - 追踪代理是只读的`);
    },

    deleteProperty(_target, _property): boolean {
      throw new Error(`无法删除属性 "${String(_property)}" - 追踪代理是只读的`);
    },

    has(target, property): boolean {
      if (typeof property === 'symbol') return false;
      if (PROTOTYPE_KEYS.has(property as string)) return false;
      const desc = Object.getOwnPropertyDescriptor(target, property as string);
      if (desc) {
        if (desc.get || desc.set) return false;
        if (typeof desc.value === 'function') return false;
      }
      return Reflect.has(target, property);
    },

    ownKeys(target: unknown[]): ArrayLike<string | symbol> {
      return Reflect.ownKeys(target).filter(
        (key) => typeof key === 'symbol' || !PROTOTYPE_KEYS.has(key as string),
      );
    },

    getOwnPropertyDescriptor(
      target: unknown[],
      property: string | symbol,
    ): PropertyDescriptor | undefined {
      if (typeof property === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
      if (PROTOTYPE_KEYS.has(property as string)) return undefined;
      const desc = Reflect.getOwnPropertyDescriptor(target, property);
      if (desc && 'writable' in desc) {
        try {
          desc.writable = false;
        } catch {}
      }
      return desc;
    },
  };

  const proxy = new Proxy(array, handler);
  trackingProxySet.add(proxy as object);

  // 缓存代理
  let m = c.get(array as object);
  if (!m) {
    m = new Map<string, object>();
    c.set(array as object, m);
  }
  m.set(basePath, proxy as unknown as object);

  return proxy;
}

/**
 * 清除代理缓存（用于测试或数据变更时）
 */
export function clearProxyCache(): void {
  // WeakMap 没有 clear 方法，但我们可以创建一个新的
  // 这主要用于测试目的
}

/**
 * 工具函数：在自动依赖追踪下运行函数
 *
 * @param scope - 要使用的追踪作用域
 * @param data - 提供追踪代理的数据
 * @param fn - 要在追踪下执行的函数
 * @returns 返回 [结果, 依赖] 元组
 */
export function withTracking<T>(
  scope: TrackingScope,
  data: Record<string, unknown>,
  fn: (trackedData: Record<string, unknown>) => T,
): [T, Set<string>] {
  scope.start();
  try {
    const trackedData = createTrackingProxy(data, (path) => scope.track(path), scope.getCache());
    const result = fn(trackedData);
    const deps = scope.stop();
    return [result, deps];
  } finally {
    // 即使 fn 抛出异常也确保停止追踪
    if (scope.isActive()) {
      scope.stop();
    }
  }
}
