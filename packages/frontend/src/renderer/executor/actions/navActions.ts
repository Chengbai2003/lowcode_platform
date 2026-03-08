/**
 * 导航 Actions
 * navigate - 页面跳转
 */

import type { ActionHandler } from '../../../types';
import type { NavigateAction } from '../../../types/dsl/actions/navigation';
import { resolveValue, resolveValues } from '../parser';

/**
 * 页面跳转
 * Action: { type: 'navigate'; to: Value; params?: Record<string, Value>; replace?: boolean; }
 */
export const navigate: ActionHandler = async (action, context) => {
  const navAction = action as NavigateAction;
  const { to, params, replace = false } = navAction;
  const resolvedTo = resolveValue(to, context) as string;
  const resolvedParams = params ? resolveValues(params, context) : undefined;

  if (context.navigate && typeof context.navigate === 'function') {
    context.navigate(resolvedTo, resolvedParams);
  } else if (typeof window !== 'undefined' && window.location) {
    // 降级到原生跳转
    let url = resolvedTo;
    if (resolvedParams) {
      const searchParams = new URLSearchParams(resolvedParams as Record<string, string>);
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
  } else {
    console.warn('No navigation method available');
  }

  return { to: resolvedTo, params: resolvedParams };
};

/**
 * 导出所有导航 Actions
 */
export default {
  navigate,
};
