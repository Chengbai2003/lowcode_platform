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
  /** 最大 Action 节点总数 (默认 200) */
  readonly maxActionNodes: number;
  /** 最大 Action 嵌套深度 (默认 16) */
  readonly maxActionDepth: number;
}

export const DEFAULT_SCHEMA_LIMITS: SchemaValidationLimits = {
  maxBytes: 1024 * 1024, // 1 MiB
  maxComponents: 500,
  maxDepth: 32,
  maxActionNodes: 200,
  maxActionDepth: 16,
};
