import type { ActionList } from './action-union';
import type { JsonValue } from '../types/json';

/**
 * 条件分支 Action
 */
export interface IfAction {
  readonly type: 'if';
  /** 条件表达式或布尔值 */
  readonly condition: JsonValue;
  /** 条件为真时执行的 Actions */
  readonly then: ActionList;
  /** 条件为假时执行的 Actions */
  readonly else?: ActionList;
}

/**
 * 循环 Action
 */
export interface LoopAction {
  readonly type: 'loop';
  /** 要遍历的数组或表达式 */
  readonly over: JsonValue;
  /** 当前元素变量名 */
  readonly itemVar: string;
  /** 当前索引变量名 */
  readonly indexVar?: string;
  /** 每次迭代执行的 Actions */
  readonly actions: ActionList;
}

/**
 * 运行具名 ActionFlow 的 Action
 */
export interface RunFlowAction {
  readonly type: 'runFlow';
  /** 目标 Flow 的 Logic Key */
  readonly flow: string;
  /** 可选静态入参数据 (纯 JSON) */
  readonly input?: JsonValue;
}
