/**
 * 扩展点 Actions
 * customScript, customAction
 */

import type { ActionHandler, ExecutionContext } from '../../types/dsl';
import { validateCodeSafety } from '../validation/astValidator';

/**
 * 自定义脚本Action
 * 执行用户提供的JS代码（经过AST安全验证）
 *
 * Action: { type: 'customScript'; code: string; timeout?: number; }
 */
export const customScript: ActionHandler = async (action, context) => {
  const { code, timeout = 10000 } = action;

  // 验证代码安全性
  if (!validateCodeSafety(code)) {
    throw new Error('Code validation failed: Potentially unsafe code detected');
  }

  try {
    // 创建沙箱环境
    const sandbox = createSandboxContext(context);

    // 执行代码（带超时）
    const result = await executeWithTimeout(code, sandbox, timeout);
    return result;
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Custom script execution failed: ${errorObj.message}`);
  }
};

/**
 * 自定义Action
 * 执行插件注册的自定义处理器
 *
 * Action: { type: 'customAction'; plugin: string; config: Record<string, any>; }
 */
export const customAction: ActionHandler = async (action, context) => {
  const { plugin, config } = action;

  // 检查插件是否注册
  if (!context.plugins || typeof context.plugins !== 'object') {
    throw new Error('Plugin system not available');
  }

  const pluginHandler = (context.plugins as Record<string, any>)[plugin];

  if (!pluginHandler || typeof pluginHandler !== 'function') {
    throw new Error(`Plugin "${plugin}" not found or not a function`);
  }

  try {
    // 执行插件处理器
    const result = await pluginHandler(config, context);
    return result;
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Plugin "${plugin}" execution failed: ${errorObj.message}`);
  }
};

/**
 * 创建沙箱上下文
 * 只暴露安全的API给用户代码
 */
function createSandboxContext(context: ExecutionContext): Record<string, any> {
  // 安全的白名单属性
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
    if (context[prop as keyof ExecutionContext] !== undefined) {
      sandbox[prop] = context[prop as keyof ExecutionContext];
    }
  }

  // 暴露简化的API
  if (context.ui) {
    sandbox.message = context.ui.message;
  }

  if (context.api) {
    sandbox.api = context.api;
  }

  return sandbox;
}

/**
 * 带超时的代码执行
 */
function executeWithTimeout(
  code: string,
  sandbox: Record<string, any>,
  timeout: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Execution timeout (${timeout}ms)`));
    }, timeout);

    try {
      // 提取沙箱中的变量名和值
      const keys = Object.keys(sandbox);
      const values = Object.values(sandbox);

      // 创建异步函数
      const asyncFn = new Function(...keys, `
        return (async function() {
          try {
            return await (${code});
          } catch (error) {
            throw error;
          }
        })();
      `);

      // 执行
      asyncFn(...values)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * 导出所有扩展点Actions
 */
export default {
  customScript,
  customAction,
};
