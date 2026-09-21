/**
 * 可信部署执行策略（M1b-1 PR D / 设计 §6 / Proposed ADR-0009）。
 *
 * 模式是部署级受信配置：不由 Schema/Agent/客户端声明或切换（协议中
 * 不存在任何模式字段），也不借用 Preset 身份编码。当前生产默认保持
 * `'legacy'`（生产行为字节级不变）；切换默认模式属 PR E 的受控启用提交。
 *
 * - legacy：维持现行为——apiCall 按既有语义允许；data-source 新能力被
 *   拒绝。生产默认下该拒绝由能力矩阵（六面 unsupported）承担；能力矩阵
 *   放行的可信测试 / E 部署必须同时处于 operation-only，该耦合由
 *   evaluatePageSchemaCapabilities 的 DATASOURCE_REQUIRES_OPERATION_ONLY
 *   规则结构化强制，不存在隐性 legacy 正向路径。
 * - operation-only：递归拒绝一切 apiCall（含纯 apiCall 页面、任意嵌套
 *   ActionList 容器与 ActionFlow steps/onError）；数据查询只能经
 *   executeDataSource 由宿主服务执行。
 *
 * 同一页面禁止混用两类网络动作（DATASOURCE_MIXED_API_CALL，模式无关）。
 */
export type ExecutionPolicy = 'legacy' | 'operation-only';

export const EXECUTION_POLICY_VALUES: readonly ExecutionPolicy[] = Object.freeze([
  'legacy',
  'operation-only',
]);

export function isExecutionPolicy(value: unknown): value is ExecutionPolicy {
  return (
    typeof value === 'string' && (EXECUTION_POLICY_VALUES as readonly string[]).includes(value)
  );
}

/** 生产默认执行策略（trusted deployment constant，随构建交付） */
const TRUSTED_EXECUTION_POLICY: ExecutionPolicy = 'legacy';

export function getTrustedExecutionPolicy(): ExecutionPolicy {
  return TRUSTED_EXECUTION_POLICY;
}

/**
 * 执行策略拒绝诊断编码（SchemaContractIssue.code 字符串；
 * 与 CAPABILITY_ISSUE_CODES 分开冻结，不改动既有能力诊断契约）
 */
export const EXECUTION_POLICY_ISSUE_CODES = Object.freeze({
  APICALL_FORBIDDEN: 'APICALL_FORBIDDEN_BY_POLICY',
  DATASOURCE_REQUIRES_OPERATION_ONLY: 'DATASOURCE_REQUIRES_OPERATION_ONLY',
  MIXED_NETWORK_ACTIONS: 'DATASOURCE_MIXED_API_CALL',
} as const);

export type ExecutionPolicyIssueCode =
  (typeof EXECUTION_POLICY_ISSUE_CODES)[keyof typeof EXECUTION_POLICY_ISSUE_CODES];
