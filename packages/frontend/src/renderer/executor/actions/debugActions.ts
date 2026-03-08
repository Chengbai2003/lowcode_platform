/**
 * 调试 Actions
 * log
 */

import type { ActionHandler } from '../../../types';
import { resolveValue } from '../parser';

/**
 * 日志输出
 * Action: { type: 'log'; value: Value; level?: 'log' | 'info' | 'warn' | 'error'; }
 */
export const log: ActionHandler = async (action, context) => {
  const { value, level = 'log' } = action;
  const resolvedValue = resolveValue(value, context);

  if (context.onLog && typeof context.onLog === 'function') {
    context.onLog(level, '', resolvedValue);
  } else {
    const consoleFn = (console as any)[level] as (...args: any[]) => void;
    if (typeof consoleFn === 'function') {
      consoleFn('[DSL Log]', resolvedValue);
    } else {
      console.log('[DSL Log]', resolvedValue);
    }
  }

  return { logged: resolvedValue };
};

/**
 * 导出所有调试 Actions
 */
export default {
  log,
};
