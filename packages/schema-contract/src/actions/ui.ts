import type { ActionList } from './action-union';
import type { JsonValue } from '../types/json';

/**
 * 消息反馈 Action
 */
export interface FeedbackAction {
  readonly type: 'feedback';
  /** 反馈类型：message(轻量提示) 或 notification(通知卡片) */
  readonly kind?: 'message' | 'notification';
  /** 内容文本 */
  readonly content: JsonValue;
  /** 标题 (notification 时有效) */
  readonly title?: JsonValue;
  /** 消息级别 */
  readonly level?: 'success' | 'error' | 'warning' | 'info';
  /** 显示位置 (notification 时有效) */
  readonly placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  /** 自动关闭时间(ms)，0 表示不自动关闭 */
  readonly duration?: number;
}

/**
 * 弹窗 Action
 */
export interface DialogAction {
  readonly type: 'dialog';
  /** 弹窗类型：modal(信息弹窗) 或 confirm(确认框) */
  readonly kind: 'modal' | 'confirm';
  /** 标题 */
  readonly title?: JsonValue;
  /** 内容 */
  readonly content: JsonValue;
  /** 确认回调 */
  readonly onOk?: ActionList;
  /** 取消回调 (confirm 时有效) */
  readonly onCancel?: ActionList;
}
