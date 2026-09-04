import type { JsonValue } from './json';
import type { ActionList } from '../actions/action-union';

export const FORBIDDEN_DATA_PATH_KEYS = Object.freeze([
  '__proto__',
  'prototype',
  'constructor',
] as const);

const FORBIDDEN_DATA_PATH_KEY_SET = new Set<string>(FORBIDDEN_DATA_PATH_KEYS);

export const FORBIDDEN_LOGIC_KEYS = Object.freeze([
  ...FORBIDDEN_DATA_PATH_KEYS,
  'toJSON',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
] as const);

const FORBIDDEN_LOGIC_KEY_SET = new Set<string>(FORBIDDEN_LOGIC_KEYS);

/** Runtime 数据路径每一段共用的原型污染边界。 */
export function isSafeDataPathKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !FORBIDDEN_DATA_PATH_KEY_SET.has(value);
}

/** Contract、Renderer 与 Compiler 共用的 Logic Key 安全边界。 */
export function isSafeLogicKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) &&
    !FORBIDDEN_LOGIC_KEY_SET.has(value)
  );
}

/** 无 `{{ }}` 包装、由 Contract 统一分析的只读派生表达式。 */
export type ComputedExpression = string;

/**
 * 具名、持久化的声明式 ActionFlow 流程。
 *
 * `steps` 为严格串行执行的动作列表；
 * `onError` 为可选的 flow 级错误恢复动作列表。
 */
export interface ActionFlow {
  readonly steps: ActionList;
  readonly onError?: ActionList;
}

/**
 * 页面逻辑中声明的具名 ActionFlow 字典。
 */
export type ActionFlowDeclarations = Readonly<Record<string, ActionFlow>>;

/**
 * 页面声明的逻辑初始值。
 *
 * `states` 只定义 RuntimeSession 启动值；运行中的变更不会回写 PageSchema。
 */
export interface PageLogic {
  readonly states?: Readonly<Record<string, JsonValue>>;
  readonly computed?: Readonly<Record<string, ComputedExpression>>;
}
