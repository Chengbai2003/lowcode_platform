// eslint-disable @typescript-eslint/no-explicit-any
/**
 * 高级逃生舱 Action
 * customScript - 基于 Proxy + with 的安全自定义脚本
 */

// 假设你的类型定义路径
import type { ActionHandler, ExecutionContext } from '../../../types';
import type { CustomScriptAction } from '../../../types/dsl/actions/extension';
import { getFlag } from '../../featureFlags';
import { createCapabilityAPI } from '../capability/capabilityAPI';

const BLOCKED_SCRIPT_PATTERNS = [
  {
    pattern: /\bimport\s*\(/,
    message: 'Dynamic import is not allowed in customScript',
  },
  {
    pattern: /\brequire\s*\(/,
    message: 'require() is not allowed in customScript',
  },
] as const;

function cloneForSandbox<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // fall through to JSON clone
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    if (Array.isArray(value)) return [...value] as T;
    if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) } as T;
    return value;
  }
}

function resolveValidComponentIds(context: ExecutionContext): Set<string> {
  const ids = new Set<string>();

  const components = context.components;
  if (components && typeof components === 'object') {
    for (const id of Object.keys(components as Record<string, unknown>)) {
      ids.add(id);
    }
  }

  const data = context.data;
  if (data && typeof data === 'object') {
    for (const id of Object.keys(data as Record<string, unknown>)) {
      ids.add(id);
    }
  }

  return ids;
}

/**
 * 递归深冻结：防止嵌套对象被脚本直写绕过 $.set 链路
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * 自定义脚本 Action Handler
 */
export const customScript: ActionHandler = async (action, context) => {
  const scriptAction = action as CustomScriptAction;
  const { code, timeout = 10000 } = scriptAction;

  if (!code || typeof code !== 'string') {
    throw new Error('customScript: code is required and must be a string');
  }

  try {
    // 1. 提取安全的上下文变量
    const sandboxContext = createSandboxContext(context);

    // 2. 在安全沙箱中执行代码
    const result = await executeInSandbox(code, sandboxContext, timeout);

    // 脚本执行成功后统一触发全量失效兜底（仅在非 capabilityScript 模式下）
    // capabilityScript 模式下 $.set/$.patch 内部已调用 markFullChange，无需重复触发
    if (!getFlag('capabilityScript') && typeof context.markFullChange === 'function') {
      context.markFullChange();
    }

    return result;
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const wrappedError = new Error(`Custom script execution failed: ${errorObj.message}`);
    (wrappedError as any).cause = errorObj;
    throw wrappedError;
  }
};

/**
 * 提取并构建基础上下文（白名单机制）
 */
function createSandboxContext(context: ExecutionContext): Record<string, any> {
  // Phase 3: CapabilityAPI 模式 — 只注入受控 API，不暴露 dispatch/getState
  if (getFlag('capabilityScript')) {
    const validIds = resolveValidComponentIds(context);

    const api = createCapabilityAPI({
      validComponentIds: validIds,
      getData: () => (context.data || {}) as Record<string, any>,
      setComponentData: context.setComponentData
        ? (id: string, value: any) => context.setComponentData!(id, value)
        : () => {
            console.warn('[CapabilityAPI] setComponentData not available');
          },
      markFullChange:
        typeof context.markFullChange === 'function' ? () => context.markFullChange!() : () => {},
    });

    // Object.freeze 防止脚本通过 sandbox.data/formData 直写绕过 $.set 链路
    const sandbox: Record<string, any> = {
      $: api,
      data: deepFreeze(cloneForSandbox(context.data ?? {})),
      formData: deepFreeze(cloneForSandbox(context.formData ?? {})),
      state: context.state,
      user: context.user,
      route: context.route,
      Math,
      Date,
      JSON,
      console: {
        log: (...args: any[]) => api.log(...args),
        warn: (...args: any[]) => console.warn('[Sandbox Warn]:', ...args),
        error: (...args: any[]) => console.error('[Sandbox Error]:', ...args),
      },
    };

    if (context.ui) {
      sandbox.message = context.ui.message;
    }
    if (context.api) {
      sandbox.api = context.api;
    }

    return sandbox;
  }

  // 默认路径：原有白名单机制
  const safeProps = [
    'data',
    'formData',
    'user',
    'route',
    'state',
    'dispatch',
    'getState',
    'utils',
    'navigate',
    'back',
  ];

  const sandbox: Record<string, any> = {};

  for (const prop of safeProps) {
    if (context[prop] !== undefined) {
      sandbox[prop] = context[prop];
    }
  }

  if (context.ui) {
    sandbox.message = context.ui.message;
  }

  if (context.api) {
    sandbox.api = context.api;
  }

  // 注入一些安全的内置对象，防止用户代码报错
  sandbox.Math = Math;
  sandbox.Date = Date;
  sandbox.JSON = JSON;
  sandbox.console = {
    log: (...args: any[]) => console.log('[Sandbox Log]:', ...args),
    warn: (...args: any[]) => console.warn('[Sandbox Warn]:', ...args),
    error: (...args: any[]) => console.error('[Sandbox Error]:', ...args),
  };

  return sandbox;
}

/**
 * 核心：基于 Proxy 和 with 的安全代码执行器
 */
function executeInSandbox(
  code: string,
  sandbox: Record<string, any>,
  timeout: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    for (const blocked of BLOCKED_SCRIPT_PATTERNS) {
      if (blocked.pattern.test(code)) {
        reject(new Error(blocked.message));
        return;
      }
    }

    const timeoutId = setTimeout(() => {
      reject(new Error(`Execution timeout (${timeout}ms) - Note: Only stops async hangs.`));
    }, timeout);

    // 1. 创建 Proxy 拦截器
    const sandboxProxy = new Proxy(sandbox, {
      // 拦截变量检查：强制 with 语句认为所有变量都存在于 sandboxProxy 中
      // 这样就能把所有未定义的全局变量访问（如 window, document）强行拉入 get 拦截
      has() {
        return true;
      },
      // 拦截变量读取
      get(target, key, receiver) {
        // 防御 1：防止通过 Symbol.unscopables 逃逸 with 作用域
        if (key === Symbol.unscopables) return undefined;

        // 防御 2：死守核心全局变量和危险构造器
        if (['window', 'document', 'globalThis', 'eval', 'Function'].includes(key as string)) {
          return undefined;
        }

        // 防御 3：防止通过对象的 constructor 向上攀爬获取 Function (例如: {}.constructor('return window')() )
        const value = Reflect.get(target, key, receiver);
        if (typeof value === 'function' && value === Function) {
          return undefined;
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
          return undefined;
        }

        return value;
      },
    });

    try {
      // 2. 组装执行代码
      // 注意：不能使用 "use strict"，因为严格模式下禁止使用 with 语句
      const wrappedCode = `
        return (async function() {
          with (sandboxProxy) {
            ${code}
          }
        })();
      `;

      // 3. 创建执行环境
      const asyncFn = new Function('sandboxProxy', wrappedCode);

      // 4. 执行代码：利用 call 改变 this 指向，防止 this 指向全局 window
      // 将 proxy 作为 this 传入，同时也作为 sandboxProxy 参数传入
      asyncFn
        .call(sandboxProxy, sandboxProxy)
        .then((result: any) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error: any) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(new Error(`Syntax Error in Custom Script: ${(error as Error).message}`));
    }
  });
}

export default {
  customScript,
};
