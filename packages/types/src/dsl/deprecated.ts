import type { Value } from "./context";

/**
 * @deprecated 废弃的 Action 类型
 *
 * 这些类型将在 v1.0 版本移除，请使用替代方案。
 * 使用废弃 Action 会在运行时输出警告日志。
 *
 * ## 替代方案
 * - clearField → setField(field, null)
 * - openTab, closeTab, back → navigate
 * - dispatch → setState
 * - resetForm → setState({ formName: {} })
 * - parallel → Promise.all 或 loop
 * - sequence → 普通数组顺序执行
 * - debug → log
 * - customScript → customAction (安全)
 */

// ============================================================================
// 数据操作 - 废弃
// ============================================================================

/**
 * @deprecated 使用 setField(field, null) 替代
 * 清除字段值的 Action
 */
export type ClearFieldAction = {
  type: "clearField";
  /** 字段名 */
  field: string;
};

// ============================================================================
// 导航 - 废弃
// ============================================================================

/**
 * @deprecated 简化 DSL，请使用 navigate 替代
 * 打开新标签页的 Action
 */
export type OpenTabAction = {
  type: "openTab";
  id: string;
  title: Value;
  path: Value;
  closeOthers?: boolean;
};

/**
 * @deprecated 简化 DSL，请使用 navigate 替代
 * 关闭标签页的 Action
 */
export type CloseTabAction = {
  type: "closeTab";
  id?: string;
};

/**
 * @deprecated 简化 DSL，请使用 navigate(-1) 替代
 * 返回上一页的 Action
 */
export type BackAction = {
  type: "back";
  count?: number;
};

// ============================================================================
// 状态管理 - 废弃
// ============================================================================

/**
 * @deprecated 使用 setState 替代
 * 派发 Redux action 的 Action
 */
export type DispatchAction = {
  type: "dispatch";
  action: Value;
};

/**
 * @deprecated 使用 setState({ formName: {} }) 替代
 * 重置表单的 Action
 */
export type ResetFormAction = {
  type: "resetForm";
  form: string;
};

// ============================================================================
// 流程控制 - 废弃
// ============================================================================

/**
 * @deprecated 使用 Promise.all 或 loop 替代
 * 并行执行多个 Action
 */
export type ParallelAction = {
  type: "parallel";
  actions: any[];
  waitAll?: boolean;
};

/**
 * @deprecated 普通数组顺序执行即可，无需显式声明
 * 顺序执行多个 Action
 */
export type SequenceAction = {
  type: "sequence";
  actions: any[];
};

// ============================================================================
// 调试 - 废弃
// ============================================================================

/**
 * @deprecated 使用 log 替代
 * 调试输出 Action
 */
export type DebugAction = {
  type: "debug";
  label?: string;
  value: any;
};

// ============================================================================
// 扩展 - 安全风险
// ============================================================================

/**
 * @deprecated 存在代码注入安全风险，请使用 customAction 替代
 * 执行自定义脚本的 Action
 *
 * ⚠️ 安全警告：
 * 此 Action 允许执行任意 JavaScript 代码，存在严重的 XSS 和代码注入风险。
 * 在生产环境中应禁用此功能。
 */
export type CustomScriptAction = {
  type: "customScript";
  code: string;
  timeout?: number;
};
