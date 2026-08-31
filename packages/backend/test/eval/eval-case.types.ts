/**
 * Agent Eval — 版本化用例定义（Issue #18 / M0-3）
 *
 * EvalCase / ExpectedOutcome 是版本化契约：
 * - caseSchemaVersion 变更必须同步更新本文件与全部 cases/*.json；
 * - 黄金答案（expected）的任何放宽必须在 PR 说明中给出理由，
 *   禁止为让新实现通过而静默修改 ExpectedOutcome。
 */

export const EVAL_CASE_SCHEMA_VERSION = 1;
export const EVAL_HARNESS_VERSION = 1;

export type EvalCaseCategory = 'draft' | 'patch' | 'validation' | 'conflict' | 'safety';

/** 20 个基线用例的类别配额（M0） */
export const BASELINE_CASE_QUOTAS: Record<EvalCaseCategory, number> = {
  draft: 4,
  patch: 6,
  validation: 4,
  conflict: 3,
  safety: 3,
};

export interface EvalCaseFixtures {
  /** draft/safety：录制下来的模型输出的 Schema（视为模型响应回放） */
  modelOutputSchema?: unknown;
  /** draft/validation/safety/conflict：基准 Schema */
  baseSchema?: unknown;
  /** validation：待检的非法 Schema */
  schema?: unknown;
  /** patch/validation：编辑器 Patch 操作序列 */
  patch?: unknown[];
  /** safety：待检表达式（如导航目标表达式） */
  expression?: string;
  /** conflict：CAS 场景步骤序列 */
  steps?: Array<'save' | 'saveWithCurrentBase' | 'saveStaleBase' | 'saveMissingBase'>;
}

/**
 * ExpectedOutcome：只声明该用例关心的键；runner 产出同构 actual 对象，
 * 逐键深度比较（键集以 expected 为准）。
 */
export interface ExpectedOutcome {
  /** Contract 校验是否通过（canonical schema 产出） */
  schemaValid?: boolean;
  /** 是否被安全/校验层拦截 */
  blocked?: boolean;
  /** 拦截原因子串（blocked=true 时用于确认拦对了地方） */
  blockedReason?: string;
  /** patch 归一化后的有效操作数（去重/去 no-op 之后） */
  normalizedOps?: number;
  /** patch 提交操作数（透传，用于 Patch Minimality 计算） */
  submittedOps?: number;
  /** 风险等级（assessPatchRisk） */
  riskLevel?: string;
  /** conflict：有效保存后的页面版本 */
  finalVersion?: number;
  /** conflict：过期 basePageVersion 是否被 CAS 拒绝 */
  staleBaseConflict?: boolean;
  /** conflict：缺失 basePageVersion 的覆盖保存是否被拒绝 */
  missingBaseConflict?: boolean;
  /** draft：canonical Schema 中出现的组件 id（排序后） */
  componentIds?: string[];
  /** 语义断言：补丁应用后存在的组件 id */
  componentExists?: string[];
  /** 语义断言：补丁应用后不存在/被删除的组件 id */
  componentMissing?: string[];
  /** 语义断言：指定组件的属性期望值 */
  props?: Record<string, Record<string, unknown>>;
  /** 语义断言：指定组件的事件绑定期望值 */
  events?: Record<string, Record<string, unknown[]>>;
}

export interface EvalCase {
  id: string;
  caseSchemaVersion: number;
  category: EvalCaseCategory;
  title: string;
  /** 模型意图（live 通道使用；deterministic 通道仅记录） */
  intent: string;
  fixtures: EvalCaseFixtures;
  expected: ExpectedOutcome;
}

export interface EvalCaseResult {
  id: string;
  category: EvalCaseCategory;
  title: string;
  /** runner 产出的实际结果（键集与 expected 对齐后比较） */
  actual: Record<string, unknown>;
  matchesExpected: boolean;
  mismatches: string[];
}

export interface EvalRunReport {
  harnessVersion: number;
  caseSchemaVersion: number;
  contractPackageVersion: string;
  /** 生成报告时的 git 提交（复现锚点） */
  revision: string;
  generatedAt: string;
  totalCases: number;
  metrics: {
    expectedOutcomeRate: number;
    schemaValidRate: number | null;
    patchMinimality: number | null;
    safetyBlockRate: number | null;
    versionConflictIntegrity: number | null;
    replayReproducibility: number;
  };
  cases: EvalCaseResult[];
}
