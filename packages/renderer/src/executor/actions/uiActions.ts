/**
 * UI 交互 Actions
 * feedback (消息/通知), dialog (弹窗/确认框)
 */

import type { ActionHandler } from '../../dsl';
import { isCapabilityGranted, type HostCapabilities } from '../../host/HostCapabilities';
import type { FeedbackAction, DialogAction } from '../../dsl/actions/ui';
import { resolveValue } from '../parser';
import { getFlowRunContext, withFlowRunPath } from '../../session/FlowRun';

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
  const flowContext = getFlowRunContext(context);
  if (flowContext) {
    flowContext.throwIfAborted();
  }

  const feedbackAction = action as FeedbackAction;
  const {
    kind = 'message',
    content,
    title,
    level = 'info',
    placement = 'topRight',
    duration = kind === 'message' ? 3 : 4.5,
  } = feedbackAction;

  const resolvedContent = resolveValue(content, context);
  const resolvedTitle = title ? resolveValue(title, context) : undefined;

  if (kind === 'notification') {
    // 通知卡片
    if (context.ui?.notification) {
      const notifyFn = context.ui.notification[level as keyof typeof context.ui.notification];
      if (typeof notifyFn === 'function') {
        notifyFn({
          message: resolvedTitle ? String(resolvedTitle) : '通知',
          description: String(resolvedContent),
          duration,
          placement,
        });
      }
    } else {
      console.log(`[${level.toUpperCase()}] ${resolvedTitle || '通知'}: ${resolvedContent}`);
    }
  } else {
    // 轻量消息
    if (context.ui?.message) {
      const messageFn = context.ui.message[level as keyof typeof context.ui.message];
      if (typeof messageFn === 'function') {
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
  const flowContext = getFlowRunContext(context);
  if (flowContext) {
    flowContext.throwIfAborted();
  }

  const dialogAction = action as DialogAction;
  const { kind, title, content, onOk, onCancel } = dialogAction;

  const resolvedTitle = title ? resolveValue(title, context) : kind === 'confirm' ? '确认' : '提示';
  const resolvedContent = resolveValue(content, context);

  let confirmed: boolean;

  if (context.ui?.modal) {
    // 使用 UI 组件库
    if (kind === 'confirm') {
      confirmed = await context.ui.modal.confirm({
        title: String(resolvedTitle),
        content: String(resolvedContent),
        okText: '确定',
        cancelText: '取消',
      });
    } else {
      await context.ui.modal.info({
        title: String(resolvedTitle),
        content: String(resolvedContent),
        okText: '确定',
      });
      confirmed = true;
    }
  } else {
    // 降级到原生：M0-4 Scope E —— 需要宿主授予 dialogs 能力（默认 deny）
    if (
      !isCapabilityGranted(
        context.hostCapabilities as Readonly<HostCapabilities> | undefined,
        'dialogs',
      )
    ) {
      console.warn(
        '[Renderer] Host capability denied: "dialogs" — native confirm/alert suppressed (fail-close)',
      );
      confirmed = false;
    } else if (kind === 'confirm') {
      confirmed = window.confirm(`${resolvedTitle}\n\n${resolvedContent}`);
    } else {
      window.alert(`${resolvedTitle}\n\n${resolvedContent}`);
      confirmed = true;
    }
  }

  // 每次 await 返回后重新检查 signal（dispose 后 resolve 则抛出中止）
  if (flowContext) {
    flowContext.throwIfAborted();
  }

  // 执行回调
  if (confirmed && onOk && executor) {
    if (flowContext) {
      for (let a = 0; a < onOk.length; a++) {
        flowContext.throwIfAborted();
        const act = onOk[a];
        const childContext = withFlowRunPath(context, flowContext, [
          ...flowContext.stepPath,
          'onOk',
          a,
        ]);
        await (executor as any).executeSingle(act, childContext);
      }
    } else {
      await (executor as any).execute(onOk, context);
    }
  } else if (!confirmed && onCancel && executor) {
    if (flowContext) {
      for (let a = 0; a < onCancel.length; a++) {
        flowContext.throwIfAborted();
        const act = onCancel[a];
        const childContext = withFlowRunPath(context, flowContext, [
          ...flowContext.stepPath,
          'onCancel',
          a,
        ]);
        await (executor as any).executeSingle(act, childContext);
      }
    } else {
      await (executor as any).execute(onCancel, context);
    }
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
