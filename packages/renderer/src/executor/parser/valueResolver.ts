/**
 * 值解析器
 * 用于解析DSL Action中的Value类型，支持静态值、表达式、嵌套对象等
 */

import { parseAndEvaluate, isExpression as isExpr } from './expressionParser';
import type { Value, ExecutionContext } from '../../types/dsl';

/**
 * 解析Value类型
 * 根据值的类型自动解析表达式或返回原值
 */
export function resolveValue(value: Value, context: ExecutionContext): any {
  // null和undefined直接返回
  if (value === null || value === undefined) {
    return value;
  }

  // 字符串：检查是否是表达式
  if (typeof value === 'string') {
    if (isExpr(value)) {
      return parseAndEvaluate(value, context);
    }
    return value;
  }

  // 数字、布尔值直接返回
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // 数组：递归解析每个元素
  if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, context));
  }

  // 对象：递归解析每个属性值
  if (typeof value === 'object') {
    const resolved: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, context);
    }
    return resolved;
  }

  // 函数类型（特殊情况，直接返回）
  if (typeof value === 'function') {
    return value;
  }

  return value;
}

/**
 * 批量解析多个值
 */
export function resolveValues(values: Record<string, Value>, context: ExecutionContext): Record<string, any> {
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(values)) {
    resolved[key] = resolveValue(value, context);
  }
  return resolved;
}

/**
 * 解析数组类型的Value
 */
export function resolveArray(values: Value[], context: ExecutionContext): any[] {
  return values.map(item => resolveValue(item, context));
}

/**
 * 判断Value类型
 */
export function getValueType(value: Value): 'literal' | 'expression' | 'object' | 'array' | 'function' {
  if (value === null || value === undefined) {
    return 'literal';
  }

  if (typeof value === 'string') {
    return isExpr(value) ? 'expression' : 'literal';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  if (typeof value === 'function') {
    return 'function';
  }

  return 'literal';
}

/**
 * 安全地获取嵌套属性值
 */
export function safeGet(obj: any, path: string, defaultValue: any = undefined): any {
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
 * 安全地设置嵌套属性值
 */
export function safeSet(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop();

  if (!lastKey) {
    return;
  }

  let current = obj;

  for (const key of keys) {
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
}

/**
 * 深度合并对象
 */
export function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };

  for (const key in source) {
    if (source[key] == null) {
      result[key] = source[key];
    } else if (typeof source[key] === 'object' && typeof result[key] === 'object' && !Array.isArray(source[key]) && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 导出
 */
export default {
  resolveValue,
  resolveValues,
  resolveArray,
  getValueType,
  safeGet,
  safeSet,
  deepMerge,
};
