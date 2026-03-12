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

  // 解析路径
  const keys = field.split('.');
  const lastKey = keys.pop();

  if (!lastKey) {
    throw new Error(`setValue: invalid field path "${field}"`);
  }

  // 获取目标对象
  let target: Record<string, unknown> = context.data || {};

  // 特殊路径处理
  if (keys[0] === 'state') {
    target = context.state;
    keys.shift(); // 移除 "state" 前缀
  } else if (keys[0] === 'formData') {
    target = context.formData;
    keys.shift();
  }

  // 遍历到父级（安全检查每个 key）
  for (const key of keys) {
    // 原型污染防护：跳过危险键名
    if (!isSafeKey(key)) {
      throw new Error(`setValue: forbidden key "${key}" - potential prototype pollution`);
    }
    if (target[key] == null || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key] as Record<string, unknown>;
  }

  // 设置值（安全检查 lastKey）
  if (!isSafeKey(lastKey)) {
    throw new Error(`setValue: forbidden key "${lastKey}" - potential prototype pollution`);
  }

  if (merge && typeof resolvedValue === 'object' && resolvedValue !== null) {
    // 合并模式：过滤危险键名后浅合并
    const safeValue: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(resolvedValue)) {
      if (isSafeKey(k)) {
        safeValue[k] = v;
      }
    }
    if (typeof target[lastKey] !== 'object' || target[lastKey] === null) {
      target[lastKey] = {};
    }
    Object.assign(target[lastKey] as Record<string, unknown>, safeValue);
  } else {
    // 直接设置
    target[lastKey] = resolvedValue;
  }

  // 触发 dispatch（如果存在）
  if (context.dispatch) {
    context.dispatch({
      type: 'SET_FIELD',
      payload: { field, value: resolvedValue, merge },
    });
  }

  // 通知响应式系统：DSL 写入无法精确追踪，标记全量变更
  if (typeof context.markFullChange === 'function') {
    context.markFullChange();
  }

  return { field, value: resolvedValue, merge };
};

/**
 * 导出所有数据操作 Actions
 */
export default {
  setValue,
};
