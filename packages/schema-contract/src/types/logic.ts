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
 * 页面对可信 Operation 的公开精确引用（ADR-0005 / ADR-0009）。
 *
 * `revision` 是不透明的精确修订标识：不解释为 semver，不允许 `latest`、
 * 范围或隐式升级；跨环境只替换可信基础设施绑定，不改变操作契约。
 * 引用不携带 URL、Headers、凭据、风险等级或超时策略。
 */
export interface OperationRef {
  readonly operationId: string;
  readonly revision: string;
}

/**
 * 具名只读数据源声明：只保存 OperationRef 与参数映射。
 *
 * 声明不是查询结果，也不是执行中的请求；响应、请求句柄与运行值绝不进入
 * PageSchema（ADR-0007）。参数值复用现有安全 Value/`{{ }}` 表达式机制，
 * Contract 对模板串保持不透明。
 */
export interface DataSourceDeclaration {
  readonly operationRef: OperationRef;
  readonly params?: Readonly<Record<string, JsonValue>>;
}

/**
 * 页面逻辑中声明的具名数据源字典。
 */
export type DataSourceDeclarations = Readonly<Record<string, DataSourceDeclaration>>;

/**
 * 页面声明的逻辑初始值。
 *
 * `states` 只定义 RuntimeSession 启动值；运行中的变更不会回写 PageSchema。
 */
export interface PageLogic {
  readonly states?: Readonly<Record<string, JsonValue>>;
  readonly computed?: Readonly<Record<string, ComputedExpression>>;
  readonly flows?: ActionFlowDeclarations;
  readonly dataSources?: DataSourceDeclarations;
}
