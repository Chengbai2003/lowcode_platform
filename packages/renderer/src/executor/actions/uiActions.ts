/**
 * UI交互 Actions
 * message, modal, confirm, notification
 */

import type { ActionHandler, ExecutionContext } from '../../types/dsl';
import { resolveValue, resolveValues } from '../parser';

/**
 * 显示消息提示
 * Action: { type: 'message'; content: Value; messageType?: 'success' | 'error' | 'warning' | 'info'; duration?: number; }
 */
export const message: ActionHandler = async (action, context) => {
  const { content, messageType = 'info', duration } = action;
  const resolvedContent = resolveValue(content, context);

  if (context.ui?.message) {
    const messageFn = context.ui.message[messageType];
    if (typeof messageFn === 'function') {
      messageFn(String(resolvedContent));
    }
  } else {
    // 降级到console
    console.log(`[${messageType.toUpperCase()}] ${resolvedContent}`);
  }

  return { success: true };
};

/**
 * 显示模态框
 * Action: { type: 'modal'; title: Value; content: Value; onOk?: Action[]; onCancel?: Action[]; showCancel?: boolean; }
 */
export const modal: ActionHandler = async (action, context, executor) => {
  const { title, content, onOk, onCancel, showCancel = true } = action;
  const resolvedTitle = resolveValue(title, context);
  const resolvedContent = resolveValue(content, context);

  if (context.ui?.modal) {
    const confirmResult = await context.ui.modal.confirm({
      title: String(resolvedTitle),
      content: String(resolvedContent),
      okText: '确定',
      cancelText: showCancel ? '取消' : undefined,
      maskClosable: false,
    });

    if (confirmResult) {
      if (onOk && executor) {
        await executor.execute(onOk, context);
      }
    } else if (onCancel && executor) {
      await executor.execute(onCancel, context);
    }
  } else {
    // 降级到alert
    const confirmed = window.confirm(`${resolvedTitle}\n\n${resolvedContent}`);
    if (confirmed && onOk && executor) {
      await executor.execute(onOk, context);
    } else if (!confirmed && onCancel && executor) {
      await executor.execute(onCancel, context);
    }
  }

  return { confirmed: true };
};

/**
 * 显示确认对话框
 * Action: { type: 'confirm'; title?: Value; content: Value; onOk?: Action[]; onCancel?: Action[]; }
 */
export const confirm: ActionHandler = async (action, context, executor) => {
  return modal(action, context, executor);
};

/**
 * 显示通知
 * Action: { type: 'notification'; title: Value; description?: Value; messageType?: 'success' | 'error' | 'warning' | 'info'; duration?: number; placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'; }
 */
export { notification as alert };
export const notification: ActionHandler = async (action, context) => {
  const {
    title,
    description,
    messageType = 'info',
    duration = 4.5,
    placement = 'topRight',
  } = action;

  const resolvedTitle = resolveValue(title, context);
  const resolvedDescription = description ? resolveValue(description, context) : undefined;

  if (context.ui?.notification) {
    const notifyFn = context.ui.notification[messageType];
    if (typeof notifyFn === 'function') {
      notifyFn({
        message: String(resolvedTitle),
        description: resolvedDescription ? String(resolvedDescription) : undefined,
        duration,
        placement,
      });
    }
  } else {
    // 降级到console
    console.log(`[${messageType.toUpperCase()}] ${resolvedTitle}`, resolvedDescription || '');
  }

  return { success: true };
};

/**
 * 导出所有UI交互Actions
 */
export default {
  message,
  modal,
  confirm,
  notification,
  alert, // 别名
};
