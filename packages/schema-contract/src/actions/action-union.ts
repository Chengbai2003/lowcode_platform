import type { SetValueAction } from './data';
import type { IfAction, LoopAction } from './flow';
import type { NavigateAction } from './navigation';
import type { ApiCallAction, DelayAction } from './async';
import type { FeedbackAction, DialogAction } from './ui';
import type { LogAction } from './debug';

/**
 * 纯数据 Action 联合类型
 * 注意：customScript 已被永久移除，历史输入在验证时会直接报错
 */
export type Action =
  | SetValueAction
  | ApiCallAction
  | NavigateAction
  | FeedbackAction
  | DialogAction
  | IfAction
  | LoopAction
  | DelayAction
  | LogAction;

export type ActionList = readonly Action[];

export const CORE_ACTION_TYPES = [
  'setValue',
  'apiCall',
  'navigate',
  'feedback',
  'dialog',
  'if',
  'loop',
  'delay',
  'log',
] as const;

export type CoreActionType = (typeof CORE_ACTION_TYPES)[number];

export function isCoreActionType(type: string): type is CoreActionType {
  return (CORE_ACTION_TYPES as readonly string[]).includes(type);
}
