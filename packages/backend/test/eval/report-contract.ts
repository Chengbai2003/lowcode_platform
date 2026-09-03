import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import type {
  EvalCaseCategory,
  EvalCaseStatus,
  EvalCaseTelemetry,
  EvalExecutionProfile,
} from './eval-case.types';
import type { EvalMetrics } from './metrics';
import evalReportSchema from './eval-report.schema.json';

export type EvalRunMode = 'deterministic' | 'live';

export interface EvalRunMetadata {
  runId: string;
  mode: EvalRunMode;
  generatedAt: string;
  revision: string;
  /** `live` 目标部署的 revision 必须由运行者显式声明，不能读取本地 checkout 猜测。 */
  revisionSource: 'local_checkout' | 'target_declaration';
  provider: string | null;
  model: string | null;
  /** 当前 production API 未返回模型解析结果；Live 只记录明确请求的选择。 */
  modelSelectionSource: 'fixture' | 'requested' | 'observed';
}

export type { EvalCaseTelemetry, EvalExecutionProfile } from './eval-case.types';

export interface EvalEnvironment {
  contract: {
    packageVersion: string;
    packageVersionSource: 'local_checkout' | 'target_declaration';
    pageSchemaVersion: number | null;
    evalCaseSchemaVersion: number;
  };
  /** Live 基础设施不可用而无法观察时为 null，不伪造版本三元组。 */
  runtimeCompatibility: RuntimeCompatibility | null;
  sourceVersions: {
    prompt: string;
    tool: string;
    manifest: string;
    source: 'local_checkout' | 'target_declaration';
  };
}

export interface EvalReportCase {
  id: string;
  category: EvalCaseCategory;
  title: string;
  status: EvalCaseStatus;
  /** 原始实际输出与错误文本不进入公开报告；仅保留失败字段数量。 */
  mismatchCount?: number;
  executionProfile?: EvalExecutionProfile;
  telemetry: EvalCaseTelemetry;
}

export interface EvalReportCaseInput {
  id: string;
  category: EvalCaseCategory;
  title: string;
  status: EvalCaseStatus;
  mismatchCount?: number;
  executionProfile?: EvalExecutionProfile;
  telemetry?: EvalCaseTelemetry;
}

export interface EvalCoverage {
  totalCases: number;
  selectedCases: number;
  executedCases: number;
  passedCases: number;
  failedCases: number;
  unsupportedCases: number;
  infraErrorCases: number;
  notSelectedCases: number;
  coverageRate: number | null;
  qualityPassRate: number | null;
}

export interface EvalRunMetrics extends EvalMetrics {
  qualityPassRate: number | null;
}

export interface EvalRunReport {
  reportVersion: 1;
  run: EvalRunMetadata;
  environment: EvalEnvironment;
  coverage: EvalCoverage;
  metrics: EvalRunMetrics;
  cases: readonly EvalReportCase[];
  resultsDigest: string;
}

export interface EvalRunReportInput {
  run: EvalRunMetadata;
  environment: EvalEnvironment;
  metrics: EvalMetrics;
  cases: readonly EvalReportCaseInput[];
}

export interface EvalCanonicalResults {
  reportVersion: 1;
  environment: EvalEnvironment;
  coverage: EvalCoverage;
  metrics: EvalRunMetrics;
  cases: ReadonlyArray<Omit<EvalReportCase, 'telemetry'>>;
}

interface ReportContractRuntime {
  EVAL_REPORT_VERSION: 1;
  canonicalResults(report: EvalRunReport): EvalCanonicalResults;
  createEvalRunReport(input: EvalRunReportInput): EvalRunReport;
  resultsDigest(report: Omit<EvalRunReport, 'resultsDigest'>): string;
  stableJson(value: unknown): string;
  summarizeCoverage(cases: readonly EvalReportCase[]): EvalCoverage;
  toObservedToolCalls(toolCalls: unknown): EvalCaseTelemetry['toolCalls'];
}

// `run-live.mjs` 由原生 Node 直接执行，因此将无状态的归一化/摘要逻辑保留为 CJS，
// 两条通道共享同一实现；本文件提供完整的 TypeScript 契约。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const runtime = require('./report-contract.cjs') as ReportContractRuntime;

export const EVAL_REPORT_VERSION = runtime.EVAL_REPORT_VERSION;
export const EVAL_RUN_REPORT_JSON_SCHEMA = evalReportSchema;
export const canonicalResults = runtime.canonicalResults;
export const createEvalRunReport = runtime.createEvalRunReport;
export const resultsDigest = runtime.resultsDigest;
export const stableJson = runtime.stableJson;
export const summarizeCoverage = runtime.summarizeCoverage;
export const toObservedToolCalls = runtime.toObservedToolCalls;
