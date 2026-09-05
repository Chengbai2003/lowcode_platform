import type { PageSchema } from '../types/schema';
import type { SchemaContractIssue } from '../validation/issues';
import {
  SCHEMA_CAPABILITIES,
  CONSUMER_SURFACES,
  REQUIRED_CAPABILITY_REVISION,
  CAPABILITY_ISSUE_CODES,
  type CapabilityEvaluationResult,
} from './types';
import { getTrustedCapabilityManifest } from './manifest';
import { detectPageSchemaCapabilities } from './detect';

const DEFAULT_MAX_CAPABILITY_ISSUES = 50;

/**
 * 纯能力求值器（Pure Capability Evaluator）
 *
 * 规则：
 * 1. 只有 canonical PageSchema 中实际使用到的能力，才参与支持矩阵求值；
 * 2. 只有六个消费面均明确为 status='supported' 且 revision 精确匹配才通过；
 * 3. 缺失、unknown、unsupported、非对象、未知 status、revision mismatch 均拒绝；
 * 4. 严格只读取自有属性（own property descriptors），防范 Object.prototype 原型链污染；
 * 5. 按照固定能力顺序和消费面顺序确定性输出诊断 Issue。
 */
export function evaluatePageSchemaCapabilities(
  schema: PageSchema,
  manifestInput?: unknown,
  options?: { maxIssues?: number },
): CapabilityEvaluationResult {
  const rawManifest = manifestInput === undefined ? getTrustedCapabilityManifest() : manifestInput;

  if (rawManifest === null || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    return {
      ok: false,
      issues: [
        {
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: ['capabilities'],
          message: 'Capability manifest must be a non-null object',
        },
      ],
    };
  }

  let matrix: unknown = rawManifest;
  if (Object.prototype.hasOwnProperty.call(rawManifest, 'matrix')) {
    const matrixDesc = Object.getOwnPropertyDescriptor(rawManifest, 'matrix');
    matrix = matrixDesc ? matrixDesc.value : undefined;
  }

  if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return {
      ok: false,
      issues: [
        {
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: ['capabilities'],
          message: 'Capability matrix must be a non-null object',
        },
      ],
    };
  }

  // 检测当前 canonical schema 使用的所有语义能力
  const detected = detectPageSchemaCapabilities(schema);
  if (detected.size === 0) {
    // 纯 Legacy 或未使用任何高级能力的合法 Schema 直接通过
    return { ok: true, issues: [] };
  }

  const maxIssues = options?.maxIssues ?? DEFAULT_MAX_CAPABILITY_ISSUES;
  const issues: SchemaContractIssue[] = [];

  // 按固定能力顺序遍历
  for (const capability of SCHEMA_CAPABILITIES) {
    if (issues.length >= maxIssues) break;
    const info = detected.get(capability);
    if (!info) continue;
    const triggerPath = info.primaryPath;

    // 检查 matrix 是否具有自有能力条目
    if (!Object.prototype.hasOwnProperty.call(matrix, capability)) {
      for (const surface of CONSUMER_SURFACES) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.UNKNOWN,
          path: triggerPath,
          message: `Capability "${capability}" is not defined in capability manifest for consumer surface "${surface}"`,
        });
        if (issues.length >= maxIssues) break;
      }
      continue;
    }

    const capDesc = Object.getOwnPropertyDescriptor(matrix, capability);
    const capRecord = capDesc ? capDesc.value : undefined;

    if (capRecord === null || typeof capRecord !== 'object' || Array.isArray(capRecord)) {
      for (const surface of CONSUMER_SURFACES) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Capability manifest entry for "${capability}" is not a valid object`,
        });
        if (issues.length >= maxIssues) break;
      }
      continue;
    }

    // 按固定消费面顺序检查六大消费面
    for (const surface of CONSUMER_SURFACES) {
      if (issues.length >= maxIssues) break;

      if (!Object.prototype.hasOwnProperty.call(capRecord, surface)) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.UNKNOWN,
          path: triggerPath,
          message: `Capability "${capability}" is not defined in capability manifest for consumer surface "${surface}"`,
        });
        continue;
      }

      const surfaceDesc = Object.getOwnPropertyDescriptor(capRecord, surface);
      const entry = surfaceDesc ? surfaceDesc.value : undefined;

      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Invalid capability manifest entry for capability "${capability}" and surface "${surface}": expected object`,
        });
        continue;
      }

      const statusDesc = Object.getOwnPropertyDescriptor(entry, 'status');
      const revisionDesc = Object.getOwnPropertyDescriptor(entry, 'revision');
      const status = statusDesc ? statusDesc.value : undefined;
      const revision = revisionDesc ? revisionDesc.value : undefined;

      if (status !== 'supported' && status !== 'unsupported') {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Invalid capability status for "${capability}" on surface "${surface}": expected "supported" or "unsupported", received ${JSON.stringify(status)}`,
        });
        continue;
      }

      if (typeof revision !== 'number' || !Number.isInteger(revision) || revision <= 0) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Invalid capability revision for "${capability}" on surface "${surface}": expected positive integer, received ${JSON.stringify(revision)}`,
        });
        continue;
      }

      if (status === 'unsupported') {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.UNSUPPORTED,
          path: triggerPath,
          message: `Capability "${capability}" (required revision ${REQUIRED_CAPABILITY_REVISION}) is unsupported by consumer surface "${surface}"`,
        });
        continue;
      }

      if (revision !== REQUIRED_CAPABILITY_REVISION) {
        issues.push({
          code: CAPABILITY_ISSUE_CODES.REVISION_MISMATCH,
          path: triggerPath,
          message: `Capability "${capability}" revision mismatch on consumer surface "${surface}": required revision ${REQUIRED_CAPABILITY_REVISION}, manifest specifies revision ${revision}`,
        });
        continue;
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
