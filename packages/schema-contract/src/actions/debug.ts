import type { JsonValue } from '../types/json';

/**
 * 调试日志 Action
 */
export interface LogAction {
  readonly type: 'log';
  /** 要输出的日志值 */
  readonly value: JsonValue;
  /** 日志级别 */
  readonly level?: 'log' | 'info' | 'warn' | 'error';
}
