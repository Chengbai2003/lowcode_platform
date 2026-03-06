import type { Action } from "../action-union";
import type { Value } from "../context";

/**
 * UI交互 Actions
 * feedback (消息/通知) 和 dialog (弹窗/确认框)
 */

/**
 * 反馈 Action
 *
 * 统一的消息通知 Action，覆盖场景：
 * - 轻量消息：{ type: "feedback", content: "操作成功", level: "success" }
 * - 通知卡片：{ type: "feedback", kind: "notification", title: "系统通知", content: "有新消息" }
 */
export type FeedbackAction = {
  type: "feedback";
  /** 反馈类型：message(轻量提示) 或 notification(通知卡片) */
  kind?: "message" | "notification";
  /** 内容文本 */
  content: Value;
  /** 标题（notification 时有效） */
  title?: Value;
  /** 消息级别 */
  level?: "success" | "error" | "warning" | "info";
  /** 显示位置（notification 时有效） */
  placement?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
  /** 自动关闭时间(ms)，0 表示不自动关闭 */
  duration?: number;
};

/**
 * 弹窗 Action
 *
 * 统一的弹窗 Action，覆盖场景：
 * - 信息弹窗：{ type: "dialog", kind: "modal", title: "详情", content: "..." }
 * - 确认框：{ type: "dialog", kind: "confirm", content: "确定删除？", onOk: [...] }
 */
export type DialogAction = {
  type: "dialog";
  /** 弹窗类型：modal(信息弹窗) 或 confirm(确认框) */
  kind: "modal" | "confirm";
  /** 标题 */
  title?: Value;
  /** 内容 */
  content: Value;
  /** 确认回调 */
  onOk?: Action[];
  /** 取消回调（confirm 时有效） */
  onCancel?: Action[];
};
