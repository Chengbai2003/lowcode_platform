import type { Value } from '../context';

/**
 * 数据操作 Action
 *
 * 统一的值设置 Action，覆盖场景：
 * - 设置字段值：{ type: "setValue", field: "user.name", value: "张三" }
 * - 合并对象：{ type: "setValue", field: "user", value: { age: 18 }, merge: true }
 * - 设置状态：{ type: "setValue", field: "state.loading", value: false }
 * - 清除值：{ type: "setValue", field: "temp", value: null }
 */
export type SetValueAction = {
  type: 'setValue';
  /** 字段名，支持路径如 'user.name', 'state.loading' */
  field: string;
  /** 要设置的值 */
  value: Value;
  /** 合并模式：true 时对对象进行浅合并，false 时直接覆盖 */
  merge?: boolean;
};
