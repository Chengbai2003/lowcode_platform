/**
 * Schema 校验与解析资源预算配置
 */
export interface SchemaValidationLimits {
  /** 最大 UTF-8 字节数 (默认 1 MiB) */
  readonly maxBytes: number;
  /** 最大组件节点数量 (默认 500) */
  readonly maxComponents: number;
  /** 最大 JSON 属性嵌套深度 (默认 32) */
  readonly maxDepth: number;
  /** props/events 值内 JSON 节点（标量、对象、数组元素）总数上限 (默认 25 000) */
  readonly maxJsonNodes: number;
  /** 最大 Action 节点总数 (默认 200) */
  readonly maxActionNodes: number;
  /** 最大 Action 嵌套深度 (默认 16) */
  readonly maxActionDepth: number;
  /** 单次校验最多产生的 issue 数量，超过即短路遍历，防止 issue 数量本身导致内存放大 (默认 500) */
  readonly maxIssues: number;
}

export const DEFAULT_SCHEMA_LIMITS: SchemaValidationLimits = {
  maxBytes: 1024 * 1024, // 1 MiB
  maxComponents: 500,
  maxDepth: 32,
  maxJsonNodes: 25_000,
  maxActionNodes: 200,
  maxActionDepth: 16,
  maxIssues: 500,
};
