/**
 * 数据操作 Actions
 * setValue - 统一的值设置
 */

import type { ActionHandler } from '../../../types';
import type { SetValueAction } from '../../../types/dsl/actions/data';
import { resolveValue } from '../parser';

/**
 * 检查键名是否安全，防止原型污染
 */
function isSafeKey(key: string): boolean {
  const unsafeKeys = ['__proto__', 'constructor', 'prototype'];
  return !unsafeKeys.includes(key);
}

function validateFieldPath(field: string): void {
  if (!field) {
    throw new Error('setValue: invalid field path ""');
  }

  for (const key of field.split('.')) {
    if (!isSafeKey(key)) {
      throw new Error(`setValue: forbidden key "${key}" - potential prototype pollution`);
    }
  }
}

/**
 * 设置值
 * Action: { type: 'setValue'; field: string; value: Value; merge?: boolean; }
 *
 * 覆盖场景：
 * - 设置字段：{ type: "setValue", field: "user.name", value: "张三" }
 * - 合并对象：{ type: "setValue", field: "user", value: { age: 18 }, merge: true }
 * - 设置状态：{ type: "setValue", field: "state.loading", value: false }
 * - 清除值：{ type: "setValue", field: "temp", value: null }
 */
export const setValue: ActionHandler = async (action, context) => {
  const setValueAction = action as SetValueAction;
  const { field, value, merge = false } = setValueAction;
  const resolvedValue = resolveValue(value, context);
  validateFieldPath(field);

  if (merge && typeof resolvedValue === 'object' && resolvedValue !== null) {
    const safeValue: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(resolvedValue)) {
      if (isSafeKey(k)) {
        safeValue[k] = v;
      }
    }
    const current = context.runtime.get(field);
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    context.runtime.set(field, { ...base, ...safeValue });
  } else {
    context.runtime.set(field, resolvedValue);
  }

  return { field, value: resolvedValue, merge };
};

/**
 * 导出所有数据操作 Actions
 */
export default {
  setValue,
};
