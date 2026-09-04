/**
 * 稳定 Flow 错误码（Issue #46 F2/F3）
 */
export type FlowErrorCode =
  | 'FLOW_NOT_FOUND'
  | 'FLOW_UNSUPPORTED_STEP'
  | 'FLOW_STEP_FAILED'
  | 'FLOW_ABORTED'
  | 'FLOW_DURATION_EXCEEDED'
  | 'FLOW_ACTION_BUDGET_EXCEEDED'
  | 'FLOW_ITERATION_BUDGET_EXCEEDED'
  | 'FLOW_DEPTH_EXCEEDED'
  | 'FLOW_CONCURRENCY_EXCEEDED';

/**
 * 运行时预算配置（Issue #46 F2/F3）
 * 只能由 RuntimeSession / Compiler 宿主配置，Schema 不能修改。
 */
export interface FlowExecutionLimits {
  readonly maxExecutedActions: number;
  readonly maxLoopIterations: number;
  readonly maxFlowDepth: number;
  readonly maxConcurrentRuns: number;
  readonly maxDurationMs: number;
}

export const DEFAULT_FLOW_EXECUTION_LIMITS: FlowExecutionLimits = Object.freeze({
  maxExecutedActions: 200,
  maxLoopIterations: 200,
  maxFlowDepth: 16,
  maxConcurrentRuns: 8,
  maxDurationMs: 30000,
});

export const HARD_FLOW_EXECUTION_LIMITS: FlowExecutionLimits = Object.freeze({
  maxExecutedActions: 100000,
  maxLoopIterations: 100000,
  maxFlowDepth: 64,
  maxConcurrentRuns: 128,
  maxDurationMs: 300000,
});

/**
 * 校验并规范化运行时预算配置（拒绝 0、负数、小数、NaN、Infinity、超过硬上限）。
 */
export function normalizeFlowExecutionLimits(
  limits?: Partial<FlowExecutionLimits>,
): FlowExecutionLimits {
  if (!limits) {
    return DEFAULT_FLOW_EXECUTION_LIMITS;
  }

  const result: Record<string, number> = { ...DEFAULT_FLOW_EXECUTION_LIMITS };

  for (const key of Object.keys(DEFAULT_FLOW_EXECUTION_LIMITS) as (keyof FlowExecutionLimits)[]) {
    const val = limits[key];
    if (val !== undefined) {
      const hard = HARD_FLOW_EXECUTION_LIMITS[key];
      if (
        typeof val !== 'number' ||
        !Number.isFinite(val) ||
        !Number.isInteger(val) ||
        val <= 0 ||
        val > hard
      ) {
        throw new Error(
          `Invalid flowExecutionLimits.${key}: must be a positive finite integer <= ${hard}, got ${val}`,
        );
      }
      result[key] = val;
    }
  }

  return Object.freeze(result as unknown as FlowExecutionLimits);
}
