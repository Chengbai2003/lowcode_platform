/**
 * 调试 Actions
 * log, debug
 */

import type { ActionHandler } from '../../types/dsl';
import { resolveValue } from '../parser';

/**
 * 日志输出
 * Action: { type: 'log'; value: Value; level?: 'log' | 'info' | 'warn' | 'error'; }
 */
export const log: ActionHandler = async (action, context) => {
  const { value, level = 'log' } = action;
  const resolvedValue = resolveValue(value, context);

  // 调用context中的日志方法（如果存在）
  if (context.onLog && typeof context.onLog === 'function') {
    context.onLog(level, '', resolvedValue);
  } else {
    // 降级到console
    const consoleFn = console[level as keyof Console] as (...args: any[]) => void;
    if (typeof consoleFn === 'function') {
      consoleFn('[DSL Log]', resolvedValue);
    } else {
      console.log('[DSL Log]', resolvedValue);
    }
  }

  return { logged: resolvedValue };
};

/**
 * 调试断点
 * Action: { type: 'debug'; label?: string; }
 */
export const debug: ActionHandler = async (action, context) => {
  const { label = 'Debug Point' } = action;

  // 开发环境下暂停执行
  if (process.env.NODE_ENV !== 'production') {
    console.group(`🛑 ${label}`);
    console.log('Current Context:', context);
    console.log('Execution paused. Resume execution manually.');
    console.groupEnd();

    // 可以在这里添加断点调试器
    // debugger;
  }

  return { debug: true, label };
};

/**
 * 导出所有调试Actions
 */
export default {
  log,
  debug,
};
