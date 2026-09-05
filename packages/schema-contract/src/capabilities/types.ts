import type { SchemaContractIssue } from '../validation/issues';

/**
 * M1a 声明式逻辑的三大核心能力标识（固定 revision=1）
 */
export const SCHEMA_CAPABILITIES = ['page-state', 'named-computed', 'action-flow'] as const;

export type SchemaCapability = (typeof SCHEMA_CAPABILITIES)[number];

export function isSchemaCapability(value: unknown): value is SchemaCapability {
  return typeof value === 'string' && (SCHEMA_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * 严格按照 Issue #47 划分的六大消费面
 */
export const CONSUMER_SURFACES = [
  'contract',
  'validator',
  'editor-agent',
  'renderer',
  'compiler',
  'storage',
] as const;

export type ConsumerSurface = (typeof CONSUMER_SURFACES)[number];

export function isConsumerSurface(value: unknown): value is ConsumerSurface {
  return typeof value === 'string' && (CONSUMER_SURFACES as readonly string[]).includes(value);
}

/**
 * 当前能力语义支持版本（固定为 1）
 */
export const REQUIRED_CAPABILITY_REVISION = 1;

/**
 * 能力单元支持状态：仅支持 supported 与 unsupported
 */
export type CapabilitySupportStatus = 'supported' | 'unsupported';

/**
 * 单一消费面对单一能力的支持描述单元
 */
export interface CapabilitySupportEntry {
  readonly status: CapabilitySupportStatus;
  readonly revision: number;
}

/**
 * 完整能力支持矩阵
 */
export type CapabilityMatrix = {
  readonly [C in SchemaCapability]?: {
    readonly [S in ConsumerSurface]?: CapabilitySupportEntry;
  };
};

/**
 * 能力清单（纯数据 Manifest）
 */
export interface CapabilityManifest {
  readonly manifestVersion?: number;
  readonly matrix: CapabilityMatrix;
}

/**
 * 冻结的能力门禁 Issue 诊断编码
 */
export const CAPABILITY_ISSUE_CODES = {
  UNKNOWN: 'CAPABILITY_UNKNOWN',
  UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  REVISION_MISMATCH: 'CAPABILITY_REVISION_MISMATCH',
  MANIFEST_INVALID: 'CAPABILITY_MANIFEST_INVALID',
} as const;

export type CapabilityIssueCode =
  (typeof CAPABILITY_ISSUE_CODES)[keyof typeof CAPABILITY_ISSUE_CODES];

/**
 * 纯能力求值器返回结果
 */
export interface CapabilityEvaluationResult {
  readonly ok: boolean;
  readonly issues: readonly SchemaContractIssue[];
}
