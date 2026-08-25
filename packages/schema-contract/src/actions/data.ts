import type { JsonValue } from '../types/json';

/**
 * 设置字段/状态值 Action
 */
export interface SetValueAction {
  readonly type: 'setValue';
  /** 目标字段路径，如 'user.name', 'state.loading' */
  readonly field: string;
  /** 要设置的目标值或表达式 */
  readonly value: JsonValue;
  /** 合并模式：true 时对对象进行浅合并，false 时直接覆盖 */
  readonly merge?: boolean;
}
