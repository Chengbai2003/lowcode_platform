/**
 * 状态管理 Actions
 * dispatch, setState, resetForm
 */

import type { ActionHandler } from '../../types/dsl';
import { resolveValue, resolveValues } from '../parser';

/**
 * Redux Dispatch
 * Action: { type: 'dispatch'; action: Value; }
 */
export const dispatch: ActionHandler = async (action, context) => {
  const { action: actionPayload } = action;
  const resolvedAction = resolveValue(actionPayload, context);

  if (context.dispatch && typeof context.dispatch === 'function') {
    context.dispatch(resolvedAction);
  } else {
    console.warn('No dispatch method available in context');
  }

  return { action: resolvedAction };
};

/**
 * 设置组件状态
 * Action: { type: 'setState'; state: Record<string, Value>; }
 */
export const setState: ActionHandler = async (action, context) => {
  const { state } = action;
  const resolvedState = resolveValues(state, context);

  // 更新context中的全局state
  Object.assign(context.state, resolvedState);

  // 如果有dispatch，触发相应的action
  if (context.dispatch) {
    context.dispatch({
      type: 'SET_STATE',
      payload: resolvedState,
    });
  }

  return resolvedState;
};

/**
 * 重置表单
 * Action: { type: 'resetForm'; form: string; }
 */
export const resetForm: ActionHandler = async (action, context) => {
  const { form } = action;

  // 通过dispatch触发表单重置
  if (context.dispatch) {
    context.dispatch({
      type: 'RESET_FORM',
      payload: { form },
    });
  }

  // 清除formData中的对应表单数据
  if (context.formData && typeof context.formData === 'object') {
    const formKey = typeof form === 'string' ? form : String(form);
    if (context.formData[formKey]) {
      delete context[formKey];
    }
  }

  return { form, reset: true };
};

/**
 * 导出所有状态管理Actions
 */
export default {
  dispatch,
  setState,
  resetForm,
};
