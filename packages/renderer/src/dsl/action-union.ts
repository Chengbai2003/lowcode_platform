// ============================================================================
// Action 类型定义 —— 单一真相源对齐（Issue #16 / M0-1）
// ============================================================================
// Action 联合类型直接取自 @lowcode-platform/schema-contract：
// - Schema 与运行时可执行集合严格一致；
// - customScript 已被永久移除（历史输入在 Contract 校验时直接报错）；
// - 渲染器运行时执行类型（ActionHandler / ExecutionContext 等）保持本地定义，
//   仅通过 extension.ts 中的历史类型引用内部实现。
// ============================================================================

export type {
  Action,
  ActionList,
  SetValueAction,
  ApiCallAction,
  NavigateAction,
  FeedbackAction,
  DialogAction,
  IfAction,
  LoopAction,
  RunFlowAction,
  DelayAction,
  LogAction,
  CoreActionType,
} from '@lowcode-platform/schema-contract';

import type { Action } from '@lowcode-platform/schema-contract';

// 历史扩展类型：仅供渲染器内部执行器引用，不再是合法的 Schema Action
export type { CustomScriptAction } from './actions/extension';

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
  // 逃生舱（仅历史兼容提示，Schema 层已永久禁止）
  'customScript',
] as const;

/**
 * Action 类型守卫
 */
export function isActionType(type: string): type is Action['type'] {
  return (ACTION_TYPES as readonly string[]).includes(type) && type !== 'customScript';
}
