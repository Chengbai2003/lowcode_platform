/**
 * 导航 Actions
 * navigate - 页面跳转
 */

import type { ActionHandler } from '../../dsl';
import type { NavigateAction } from '../../dsl/actions/navigation';
import { resolveValue, resolveValues } from '../parser';
import { buildNavigationTarget } from '../../utils/sanitizeUrl';

/**
 * 页面跳转
 * Action: { type: 'navigate'; to: Value; params?: Record<string, Value>; replace?: boolean; }
 */
export const navigate: ActionHandler = async (action, context) => {
  const navAction = action as NavigateAction;
  const { to, params, replace = false } = navAction;
  const resolvedTo = resolveValue(to, context) as string;
  const resolvedParams = params
    ? (resolveValues(params, context) as Record<string, unknown>)
    : undefined;

  const final = buildNavigationTarget(resolvedTo, resolvedParams);

  if (context.navigate && typeof context.navigate === 'function') {
    context.navigate(final);
  } else if (typeof window !== 'undefined' && window.location) {
    const finalFallback = buildNavigationTarget(resolvedTo, resolvedParams);
    if (replace) {
      window.location.replace(finalFallback);
    } else {
      window.location.href = finalFallback;
    }
  } else {
    console.warn('No navigation method available');
  }

  return { to: final, params: resolvedParams };
};

/**
 * 导出所有导航 Actions
 */
export default {
  navigate,
};
