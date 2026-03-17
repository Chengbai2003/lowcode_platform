/**
 * 基于代理的依赖追踪，用于响应式更新
 *
 * 此模块提供属性访问模式的运行时追踪，
 * 实现组件渲染系统中的细粒度响应式。
 */

/** 需要忽略的原型污染键集合 */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * TrackingScope 管理一个追踪会话，在响应式求值期间收集依赖路径。
 */
export class TrackingScope {
  private active = false;
  private dependencies: Set<string> = new Set();

  /**
   * 开始追踪依赖
   */
  start(): void {
    this.active = true;
    this.dependencies.clear();
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
    if (this.active) {
      this.dependencies.add(path);
    }
  }

  /**
   * 检查追踪是否正在活动
   */
  isActive(): boolean {
    return this.active;
  }
}

/** WeakMap 用于追踪已代理的对象，避免重复 */
const proxyCache = new WeakMap<object, object>();

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
): Record<string, unknown> {
  return createDeepTrackingProxy(data, '', tracker);
}

/**
 * 创建支持嵌套路径追踪的深层追踪代理
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
): Record<string, unknown> {
  // 处理 null/undefined - 原样返回
  if (data === null || data === undefined) {
    return data as Record<string, unknown>;
  }

  // 只代理对象和数组
  if (typeof data !== 'object') {
    return data;
  }

  // 检查是否已代理（避免循环引用的无限循环）
  const cachedProxy = proxyCache.get(data);
  if (cachedProxy) {
    return cachedProxy as Record<string, unknown>;
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, property): unknown {
      // 透传 Symbol 键而不追踪（例如 Symbol.iterator, Symbol.toStringTag）
      if (typeof property === 'symbol') {
        const value = (target as any)[property];
        // 对于 symbol 直接返回值
        return value;
      }

      // 忽略原型污染键
      if (PROTOTYPE_KEYS.has(property)) {
        return undefined;
      }

      // 构建此访问的完整路径
      const fullPath = basePath ? `${basePath}.${property}` : property;

      // 追踪此访问
      tracker(fullPath);

      // 获取实际值
      const value = target[property];

      // 处理 null/undefined - 原样返回，不创建代理
      if (value === null || value === undefined) {
        return value;
      }

      // 处理数组 - 创建代理以追踪数组访问
      if (Array.isArray(value)) {
        return createArrayProxy(value, fullPath, tracker);
      }

      // 处理嵌套对象 - 创建深层代理
      if (typeof value === 'object') {
        return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker);
      }

      // 直接返回原始值
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
        return property in target;
      }
      if (PROTOTYPE_KEYS.has(property)) {
        return false;
      }
      return property in target;
    },

    ownKeys(target: Record<string, unknown>): ArrayLike<string | symbol> {
      // 过滤掉原型污染键
      return Reflect.ownKeys(target).filter(
        (key) => typeof key === 'symbol' || !PROTOTYPE_KEYS.has(key),
      );
    },

    getOwnPropertyDescriptor(
      target: Record<string, unknown>,
      property: string | symbol,
    ): PropertyDescriptor | undefined {
      if (typeof property === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
      if (PROTOTYPE_KEYS.has(property)) {
        return undefined;
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (descriptor) {
        // 使其显示为只读
        descriptor.writable = false;
        descriptor.configurable = true;
      }
      return descriptor;
    },
  };

  const proxy = new Proxy(data, handler);

  // 缓存代理以处理循环引用
  proxyCache.set(data, proxy);

  return proxy;
}

/**
 * 创建专门用于数组的追踪代理
 * 处理索引访问和数组方法
 */
function createArrayProxy(
  array: unknown[],
  basePath: string,
  tracker: (path: string) => void,
): unknown[] {
  // 检查是否已代理
  const cachedProxy = proxyCache.get(array);
  if (cachedProxy) {
    return cachedProxy as unknown[];
  }

  const handler: ProxyHandler<unknown[]> = {
    get(target, property): unknown {
      // 透传 Symbol 键而不追踪
      if (typeof property === 'symbol') {
        return (target as any)[property];
      }

      // 忽略原型污染键
      if (PROTOTYPE_KEYS.has(property)) {
        return undefined;
      }

      // 处理数字索引
      const numIndex = Number(property);
      if (!Number.isNaN(numIndex) && Number.isInteger(numIndex) && numIndex >= 0) {
        const fullPath = `${basePath}[${numIndex}]`;
        tracker(fullPath);

        const value = target[numIndex];

        // 处理数组中的嵌套对象/数组
        if (value !== null && typeof value === 'object') {
          if (Array.isArray(value)) {
            return createArrayProxy(value, fullPath, tracker);
          }
          return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker);
        }

        return value;
      }

      // 处理数组长度
      if (property === 'length') {
        tracker(`${basePath}.length`);
        return target.length;
      }

      // 处理数组方法（map, filter, find 等）
      // 这些应该被透传，但会触发元素上的 getter
      if (
        typeof property === 'string' &&
        typeof (Array.prototype as any)[property] === 'function'
      ) {
        // 返回一个包装方法，维持追踪
        const method = (target as any)[property];
        if (typeof method === 'function') {
          return (...args: unknown[]) => {
            // 追踪方法调用本身
            tracker(`${basePath}.${property}()`);
            // 应用方法 - 嵌套访问将被单独追踪
            return method.apply(target, args);
          };
        }
      }

      // 对于其他属性（如自定义属性），追踪并返回
      const fullPath = `${basePath}.${property}`;
      tracker(fullPath);

      const value = (target as any)[property];

      // 处理嵌套对象
      if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          return createArrayProxy(value, fullPath, tracker);
        }
        return createDeepTrackingProxy(value as Record<string, unknown>, fullPath, tracker);
      }

      return value;
    },

    set(_target, _property, _value): boolean {
      throw new Error(`无法设置属性 "${String(_property)}" - 追踪代理是只读的`);
    },

    deleteProperty(_target, _property): boolean {
      throw new Error(`无法删除属性 "${String(_property)}" - 追踪代理是只读的`);
    },
  };

  const proxy = new Proxy(array, handler);

  // 缓存代理
  proxyCache.set(array, proxy);

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
    const trackedData = createTrackingProxy(data, (path) => scope.track(path));
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
