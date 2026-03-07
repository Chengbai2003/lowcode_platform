/**
 * UI 交互 Actions
 * feedback (消息/通知), dialog (弹窗/确认框)
 */

import type { ActionHandler } from "../../../types";
import { resolveValue } from "../parser";

/**
 * 反馈提示
 * Action: {
 *   type: 'feedback';
 *   kind?: 'message' | 'notification';
 *   content: Value;
 *   title?: Value;
 *   level?: 'success' | 'error' | 'warning' | 'info';
 *   placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
 *   duration?: number;
 * }
 */
export const feedback: ActionHandler = async (action, context) => {
  const {
    kind = "message",
    content,
    title,
    level = "info",
    placement = "topRight",
    duration = kind === "message" ? 3 : 4.5,
  } = action;

  const resolvedContent = resolveValue(content, context);
  const resolvedTitle = title ? resolveValue(title, context) : undefined;

  if (kind === "notification") {
    // 通知卡片
    if (context.ui?.notification) {
      const notifyFn =
        context.ui.notification[level as keyof typeof context.ui.notification];
      if (typeof notifyFn === "function") {
        notifyFn({
          message: resolvedTitle ? String(resolvedTitle) : "通知",
          description: String(resolvedContent),
          duration,
          placement,
        });
      }
    } else {
      console.log(
        `[${level.toUpperCase()}] ${resolvedTitle || "通知"}: ${resolvedContent}`,
      );
    }
  } else {
    // 轻量消息
    if (context.ui?.message) {
      const messageFn =
        context.ui.message[level as keyof typeof context.ui.message];
      if (typeof messageFn === "function") {
        messageFn(String(resolvedContent));
      }
    } else {
      console.log(`[${level.toUpperCase()}] ${resolvedContent}`);
    }
  }

  return { kind, level, content: resolvedContent };
};

/**
 * 弹窗
 * Action: {
 *   type: 'dialog';
 *   kind: 'modal' | 'confirm';
 *   title?: Value;
 *   content: Value;
 *   onOk?: Action[];
 *   onCancel?: Action[];
 * }
 */
export const dialog: ActionHandler = async (action, context, executor) => {
  const { kind, title, content, onOk, onCancel } = action;

  const resolvedTitle = title
    ? resolveValue(title, context)
    : kind === "confirm"
      ? "确认"
      : "提示";
  const resolvedContent = resolveValue(content, context);

  let confirmed: boolean;

  if (context.ui?.modal) {
    // 使用 UI 组件库
    if (kind === "confirm") {
      confirmed = await context.ui.modal.confirm({
        title: String(resolvedTitle),
        content: String(resolvedContent),
        okText: "确定",
        cancelText: "取消",
      });
    } else {
      await context.ui.modal.info({
        title: String(resolvedTitle),
        content: String(resolvedContent),
        okText: "确定",
      });
      confirmed = true;
    }
  } else {
    // 降级到原生
    if (kind === "confirm") {
      confirmed = window.confirm(`${resolvedTitle}\n\n${resolvedContent}`);
    } else {
      window.alert(`${resolvedTitle}\n\n${resolvedContent}`);
      confirmed = true;
    }
  }

  // 执行回调
  if (confirmed && onOk && executor) {
    await executor.execute(onOk, context);
  } else if (!confirmed && onCancel && executor) {
    await executor.execute(onCancel, context);
  }

  return { kind, confirmed };
};

/**
 * 导出所有 UI 交互 Actions
 */
export default {
  feedback,
  dialog,
};
