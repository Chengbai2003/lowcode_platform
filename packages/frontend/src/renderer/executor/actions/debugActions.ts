/**
 * 调试 Actions
 * log
 */

import type { ActionHandler } from '../../../types';
import type { LogAction } from '../../../types/dsl/actions/debug';
import { resolveValue } from '../parser';

/**
 * 日志输出
 * Action: { type: 'log'; value: Value; level?: 'log' | 'info' | 'warn' | 'error'; }
 */
export const log: ActionHandler = async (action, context) => {
  const logAction = action as LogAction;
  const { value, level = 'log' } = logAction;
  const resolvedValue = resolveValue(value, context);

  if (context.onLog && typeof context.onLog === 'function') {
    context.onLog(level, '', resolvedValue);
  } else {
    const consoleFn = console[level] as (...args: unknown[]) => void;
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
