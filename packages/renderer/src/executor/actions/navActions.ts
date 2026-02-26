/**
 * 导航 Actions
 * navigate, openTab, closeTab, back
 */

import type { ActionHandler } from "@lowcode-platform/types";
import { resolveValue, resolveValues } from "../parser";

/**
 * 页面跳转
 * Action: { type: 'navigate'; to: Value; params?: Record<string, Value>; replace?: boolean; }
 */
export const navigate: ActionHandler = async (action, context) => {
  const { to, params, replace = false } = action;
  const resolvedTo = resolveValue(to, context);
  const resolvedParams = params ? resolveValues(params, context) : undefined;

  if (context.navigate && typeof context.navigate === "function") {
    context.navigate(resolvedTo, resolvedParams);
  } else if (window.location) {
    // 降级到原生跳转
    let url = resolvedTo;
    if (resolvedParams) {
      const searchParams = new URLSearchParams(
        resolvedParams as Record<string, string>,
      );
      url += "?" + searchParams.toString();
    }

    if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
  } else {
    console.warn("No navigation method available");
  }

  return { to: resolvedTo, params: resolvedParams };
};

/**
 * 打开新标签页
 * Action: { type: 'openTab'; id: string; title: Value; path: Value; closeOthers?: boolean; }
 */
export const openTab: ActionHandler = async (action, context) => {
  const { id, title, path, closeOthers = false } = action;
  const resolvedTitle = resolveValue(title, context);
  const resolvedPath = resolveValue(path, context);

  // 触发自定义事件，由上层应用监听处理
  const event = new CustomEvent("lowcode:openTab", {
    detail: {
      id,
      title: resolvedTitle,
      path: resolvedPath,
      closeOthers,
    },
  });
  window.dispatchEvent(event);

  // 同时也通过context中的回调调用（如果存在）
  if (context.ui?.openTab && typeof context.ui.openTab === "function") {
    context.ui.openTab({
      id,
      title: resolvedTitle,
      path: resolvedPath,
      closeOthers,
    });
  }

  return { id, title: resolvedTitle, path: resolvedPath };
};

/**
 * 关闭标签页
 * Action: { type: 'closeTab'; id?: string; }
 */
export const closeTab: ActionHandler = async (action) => {
  const { id } = action;

  // 触发自定义事件
  const event = new CustomEvent("lowcode:closeTab", {
    detail: { id },
  });
  window.dispatchEvent(event);

  return { closed: id };
};

/**
 * 返回上一页
 * Action: { type: 'back'; count?: number; }
 */
export const back: ActionHandler = async (action, context) => {
  const { count = 1 } = action;

  if (context.back && typeof context.back === "function") {
    context.back();
  } else if (window.history) {
    window.history.go(-count);
  } else {
    console.warn("No back navigation method available");
  }

  return { count };
};

/**
 * 导出所有导航Actions
 */
export default {
  navigate,
  openTab,
  closeTab,
  back,
};
