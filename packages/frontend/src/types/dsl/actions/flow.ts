import type { Action } from "../action-union";
import type { Value } from "../context";

/**
 * 流程控制 Actions
 */

/**
 * 条件分支 Action
 */
export type IfAction = {
  type: "if";
  /** 条件表达式 */
  condition: Value;
  /** 条件为真时执行 */
  then: Action[];
  /** 条件为假时执行 */
  else?: Action[];
};

/**
 * 循环 Action
 *
 * 遍历数组执行操作：
 * { type: "loop", over: "{{items}}", itemVar: "item", actions: [...] }
 */
export type LoopAction = {
  type: "loop";
  /** 要遍历的数组 */
  over: Value;
  /** 当前元素变量名 */
  itemVar: string;
  /** 当前索引变量名 */
  indexVar?: string;
  /** 每次迭代执行的 Actions */
  actions: Action[];
};
