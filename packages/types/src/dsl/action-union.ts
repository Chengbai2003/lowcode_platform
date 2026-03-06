// ============================================================================
// 核心 Action (12种) - AI Prompt 推荐生成
// ============================================================================

import type { SetFieldAction, MergeFieldAction } from "./actions/data";
import type { MessageAction, ModalAction, ConfirmAction } from "./actions/ui";
import type { NavigateAction } from "./actions/navigation";
import type { SetStateAction } from "./actions/state";
import type { ApiCallAction, DelayAction } from "./actions/async";
import type { IfAction, TryCatchAction } from "./actions/flow";
import type { LogAction } from "./actions/debug";

// ============================================================================
// 高级 Action (6种) - 需要 import 显式使用，不推荐 AI 生成
// ============================================================================

import type { NotificationAction } from "./actions/ui";
import type { WaitConditionAction } from "./actions/async";
import type { LoopAction, SwitchAction } from "./actions/flow";
import type { CustomAction } from "./actions/extension";

// ============================================================================
// 废弃 Action (向后兼容，将在 v1.0 移除)
// ============================================================================

import type {
  ClearFieldAction,
  OpenTabAction,
  CloseTabAction,
  BackAction,
  DispatchAction,
  ResetFormAction,
  ParallelAction,
  SequenceAction,
  DebugAction,
  CustomScriptAction,
} from "./deprecated";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 核心 Action 类型 (12种)
 *
 * 这些是 AI Prompt 推荐生成的 Action 类型，覆盖大多数常见场景。
 */
export type CoreAction =
  | SetFieldAction
  | MergeFieldAction
  | MessageAction
  | ModalAction
  | ConfirmAction
  | NavigateAction
  | SetStateAction
  | ApiCallAction
  | DelayAction
  | IfAction
  | TryCatchAction
  | LogAction;

/**
 * 高级 Action 类型 (6种)
 *
 * 这些 Action 用于特殊场景，不推荐 AI 自动生成。
 * 使用时需要在代码中显式 import。
 */
export type AdvancedAction =
  | NotificationAction
  | WaitConditionAction
  | LoopAction
  | SwitchAction
  | CustomAction;

/**
 * 废弃 Action 类型 (10种)
 *
 * 这些类型仅用于向后兼容，将在 v1.0 版本移除。
 * 使用时会在运行时输出警告日志。
 *
 * @see deprecated.ts 中的替代方案说明
 */
export type DeprecatedAction =
  | ClearFieldAction
  | OpenTabAction
  | CloseTabAction
  | BackAction
  | DispatchAction
  | ResetFormAction
  | ParallelAction
  | SequenceAction
  | DebugAction
  | CustomScriptAction;

/**
 * 完整 Action 类型
 *
 * 包含核心、高级和废弃的 Action 类型。
 * 新代码应优先使用 CoreAction 类型。
 */
export type Action = CoreAction | AdvancedAction | DeprecatedAction;

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
 * 核心 Action 类型列表 (12种)
 *
 * 用于：
 * 1. AI System Prompt 中告知模型可用的 Action 类型
 * 2. 运行时校验 AI 生成的 Schema
 * 3. 文档生成
 */
export const CORE_ACTION_TYPES = [
  // 数据操作
  "setField",
  "mergeField",
  // UI 交互
  "message",
  "modal",
  "confirm",
  // 导航
  "navigate",
  // 状态管理
  "setState",
  // 异步操作
  "apiCall",
  "delay",
  // 流程控制
  "if",
  "tryCatch",
  // 调试
  "log",
] as const;

/**
 * 高级 Action 类型列表 (5种)
 */
export const ADVANCED_ACTION_TYPES = [
  "notification",
  "waitCondition",
  "loop",
  "switch",
  "customAction",
] as const;

/**
 * 废弃 Action 类型列表 (10种)
 *
 * 这些 Action 会在运行时输出警告，建议迁移到替代方案。
 */
export const DEPRECATED_ACTION_TYPES = [
  "clearField",
  "openTab",
  "closeTab",
  "back",
  "dispatch",
  "resetForm",
  "parallel",
  "sequence",
  "debug",
  "customScript",
] as const;

/**
 * 所有 Action 类型列表 (27种 = 12核心 + 5高级 + 10废弃)
 *
 * 注意：原有 24 种 Action 中，部分已拆分或重新分类。
 */
export const ALL_ACTION_TYPES = [
  ...CORE_ACTION_TYPES,
  ...ADVANCED_ACTION_TYPES,
  ...DEPRECATED_ACTION_TYPES,
] as const;

/**
 * Action 类型守卫
 */
export function isCoreAction(action: Action): action is CoreAction {
  return CORE_ACTION_TYPES.includes(action.type as any);
}

export function isAdvancedAction(action: Action): action is AdvancedAction {
  return ADVANCED_ACTION_TYPES.includes(action.type as any);
}

export function isDeprecatedAction(action: Action): action is DeprecatedAction {
  return DEPRECATED_ACTION_TYPES.includes(action.type as any);
}
