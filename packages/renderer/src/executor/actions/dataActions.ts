/**
 * 数据操作 Actions
 * setField, mergeField, clearField
 */

import type { ActionHandler } from '../../types/dsl';
import { resolveValue, safeSet } from '../parser';

/**
 * 设置字段值
 * Action: { type: 'setField'; field: string; value: Value; }
 */
export const setField: ActionHandler = async (action, context) => {
  const { field, value } = action;
  const resolvedValue = resolveValue(value, context);

  // 如果context中有dispatch，使用Redux更新
  if (context.dispatch) {
    context.dispatch({
      type: 'SET_FIELD',
      payload: { field, value: resolvedValue },
    });
  }

  // 同时更新context中的data
  safeSet(context.data, field, resolvedValue);

  return resolvedValue;
};

/**
 * 合并字段值
 * Action: { type: 'mergeField'; field: string; value: Record<string, any>; }
 */
export const mergeField: ActionHandler = async (action, context) => {
  const { field, value } = action;
  const resolvedValue = resolveValue(value, context);

  if (typeof resolvedValue !== 'object' || resolvedValue === null) {
    throw new Error('mergeField: value must be an object');
  }

  // 使用dispatch更新
  if (context.dispatch) {
    context.dispatch({
      type: 'MERGE_FIELD',
      payload: { field, value: resolvedValue },
    });
  }

  // 同时更新context中的data
  const currentValue = safeGet(context.data, field, {});
  const mergedValue = deepMerge(currentValue, resolvedValue);
  safeSet(context.data, field, mergedValue);

  return mergedValue;
};

/**
 * 清除字段值
 * Action: { type: 'clearField'; field: string; }
 */
export const clearField: ActionHandler = async (action, context) => {
  const { field } = action;

  // 使用dispatch更新
  if (context.dispatch) {
    context.dispatch({
      type: 'CLEAR_FIELD',
      payload: { field },
    });
  }

  // 从context.data中删除
  const keys = field.split('.');
  const lastKey = keys.pop();
  if (lastKey) {
    let current = context.data;
    for (const key of keys) {
      if (current[key]) {
        current = current[key];
      } else {
        // 路径不存在，无法清除
        return;
      }
    }
    delete current[lastKey];
  }

  return undefined;
};

/**
 * 辅助函数：安全地获取嵌套属性
 */
function safeGet(obj: any, path: string, defaultValue: any = undefined): any {
  if (obj == null) {
    return defaultValue;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null) {
      return defaultValue;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * 辅助函数：深度合并对象
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };

  for (const key in source) {
    if (source[key] == null) {
      result[key] = source[key];
    } else if (typeof source[key] === 'object' && typeof result[key] === 'object') {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 导出所有数据操作Actions
 */
export default {
  setField,
  mergeField,
  clearField,
};
