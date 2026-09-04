/**
 * Schema 校验与解析资源预算配置
 */
export interface SchemaValidationLimits {
  /** 最大 UTF-8 字节数 (默认 1 MiB) */
  readonly maxBytes: number;
  /** 最大组件节点数量 (默认 500) */
  readonly maxComponents: number;
  /** 最大 State 声明数量 (默认 200) */
  readonly maxStateEntries: number;
  /** 最大 Computed 声明数量 (默认 200) */
  readonly maxComputedEntries: number;
  /** 单条 Computed 表达式最大字符数 (默认 10 000) */
  readonly maxComputedExpressionLength: number;
  /** 所有 Computed 表达式的 AST 节点总数上限 (默认 10 000) */
  readonly maxComputedAstNodes: number;
  /** 单条 Computed 表达式最大 AST 深度 (默认 32) */
  readonly maxComputedAstDepth: number;
  /** Computed 图最大唯一依赖边数 (默认 5 000) */
  readonly maxComputedDependencies: number;
  /** 最大 JSON 属性嵌套深度 (默认 32) */
  readonly maxDepth: number;
  /** logic/props/events 值内 JSON 节点（标量、对象、数组元素）总数上限 (默认 25 000) */
  readonly maxJsonNodes: number;
  /** 单个组件允许的最大事件绑定数量 (默认 200) */
  readonly maxEventBindings: number;
  /** 最大 ActionFlow 声明数量 (默认 200) */
  readonly maxFlowEntries: number;
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
  maxStateEntries: 200,
  maxComputedEntries: 200,
  maxComputedExpressionLength: 10_000,
  maxComputedAstNodes: 10_000,
  maxComputedAstDepth: 32,
  maxComputedDependencies: 5_000,
  maxDepth: 32,
  maxJsonNodes: 25_000,
  maxEventBindings: 200,
  maxFlowEntries: 200,
  maxActionNodes: 200,
  maxActionDepth: 16,
  maxIssues: 500,
};

/**
 * 各限制字段的合理硬上限（防止开发者配置出新的 DoS 向量）
 */
const LIMIT_HARD_CAPS: Record<keyof SchemaValidationLimits, number> = {
  maxBytes: 16 * 1024 * 1024,
  maxComponents: 10_000,
  maxStateEntries: 10_000,
  maxComputedEntries: 10_000,
  maxComputedExpressionLength: 100_000,
  maxComputedAstNodes: 100_000,
  maxComputedAstDepth: 128,
  maxComputedDependencies: 100_000,
  maxDepth: 128,
  maxJsonNodes: 5_000_000,
  maxEventBindings: 5_000,
  maxFlowEntries: 10_000,
  maxActionNodes: 100_000,
  maxActionDepth: 64,
  maxIssues: 10_000,
};

/**
 * 规范化并校验自定义 Limits：
 * 与默认值合并后，要求每个字段都是有限整数且满足 1 ≤ value ≤ 硬上限。
 * 任何字段非法（0、负数、NaN、Infinity、非整数、超硬上限）时抛出 TypeError，
 * 绝不允许静默接受 —— 例如 maxIssues: 0 会产生空 issue 集合、
 * maxJsonNodes: NaN 会使节点预算完全失效，二者都不可接受。
 */
export function normalizeValidationLimits(
  custom?: Partial<SchemaValidationLimits>,
): SchemaValidationLimits {
  const merged = { ...DEFAULT_SCHEMA_LIMITS, ...(custom ?? {}) } as SchemaValidationLimits;
  for (const key of Object.keys(LIMIT_HARD_CAPS) as Array<keyof SchemaValidationLimits>) {
    const value: unknown = merged[key];
    const max = LIMIT_HARD_CAPS[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > max
    ) {
      throw new TypeError(
        `Invalid SchemaValidationLimits.${key}: expected a finite integer between 1 and ${max}, received ${String(value)}`,
      );
    }
  }
  return merged;
}
