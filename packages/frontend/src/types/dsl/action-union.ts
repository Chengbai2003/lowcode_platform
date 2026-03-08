// ============================================================================
// Action 类型定义 (8种精简方案)
// ============================================================================

import type { SetValueAction } from './actions/data';
import type { FeedbackAction, DialogAction } from './actions/ui';
import type { NavigateAction } from './actions/navigation';
import type { ApiCallAction, DelayAction } from './actions/async';
import type { IfAction, LoopAction } from './actions/flow';
import type { LogAction } from './actions/debug';
import type { CustomScriptAction } from './actions/extension';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Action 类型 (8种)
 *
 * 精简的 Action 体系，覆盖大多数低代码场景：
 *
 * | 分类 | Action | 用途 |
 * |-----|--------|------|
 * | 数据 | setValue | 设置字段/状态值 |
 * | 网络 | apiCall | API 请求 |
 * | 路由 | navigate | 页面跳转 |
 * | 交互 | feedback | 消息/通知 |
 * | 弹窗 | dialog | 模态框/确认框 |
 * | 控制 | if, loop | 条件分支/循环 |
 * | 工具 | delay, log | 延迟/日志 |
 * | 逃生舱 | customScript | 自定义脚本 |
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
  | LogAction
  | CustomScriptAction;

/**
 * Action 列表
 */
export type ActionList = Action[];

/**
 * 事件定义
 */
export type EventDefinition = ActionList;

/**
 * 事件映射
 */
export type EventsMap = Record<string, EventDefinition>;

// ============================================================================
// 常量定义 - 用于 AI Prompt 和运行时校验
// ============================================================================

/**
 * Action 类型列表 (8种)
 */
export const ACTION_TYPES = [
  // 数据
  'setValue',
  // 网络
  'apiCall',
  // 路由
  'navigate',
  // 交互
  'feedback',
  // 弹窗
  'dialog',
  // 控制
  'if',
  'loop',
  // 工具
  'delay',
  'log',
  // 逃生舱
  'customScript',
] as const;

/**
 * Action 类型守卫
 */
export function isActionType(type: string): type is Action['type'] {
  return ACTION_TYPES.includes(type as Action['type']);
}
