import type { PageSchema } from '../types/schema';
import type { SchemaContractIssue } from '../validation/issues';
import { describeValue } from '../validation/describe';
import {
  SCHEMA_CAPABILITIES,
  CONSUMER_SURFACES,
  REQUIRED_CAPABILITY_REVISION,
  CAPABILITY_ISSUE_CODES,
  type CapabilityEvaluationResult,
  type CapabilityEvaluationOptions,
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
 * 5. 按照固定能力顺序和消费面顺序确定性输出诊断 Issue；
 * 6. 诊断预算只能限制收集的 Issue 数量，绝不能将失败判定为通过；预算参数严格校验正整数；
 * 7. 非法值使用 describeValue 安全描述，绝不调用对象的 toJSON / toString，BigInt 不抛异常。
 */
export function evaluatePageSchemaCapabilities(
  schema: PageSchema,
  manifestInput?: unknown,
  options?: CapabilityEvaluationOptions,
): CapabilityEvaluationResult {
  let maxIssues = DEFAULT_MAX_CAPABILITY_ISSUES;
  if (options !== undefined) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(
        `Invalid options: expected an object, received ${describeValue(options)}`,
      );
    }
    const maxDesc = Object.getOwnPropertyDescriptor(options, 'maxIssues');
    if (maxDesc && maxDesc.value !== undefined) {
      const max = maxDesc.value;
      if (typeof max !== 'number' || !Number.isFinite(max) || !Number.isInteger(max) || max < 1) {
        throw new TypeError(
          `Invalid maxIssues: expected a positive integer >= 1, received ${describeValue(max)}`,
        );
      }
      maxIssues = max;
    }
  }

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

  let hasFailure = false;
  const issues: SchemaContractIssue[] = [];

  const recordIssue = (issue: SchemaContractIssue): void => {
    hasFailure = true;
    if (issues.length < maxIssues) {
      issues.push(issue);
    }
  };

  // 按固定能力顺序遍历
  for (const capability of SCHEMA_CAPABILITIES) {
    const info = detected.get(capability);
    if (!info) continue;
    const triggerPath = info.primaryPath;

    // 检查 matrix 是否具有自有能力条目
    if (!Object.prototype.hasOwnProperty.call(matrix, capability)) {
      for (const surface of CONSUMER_SURFACES) {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.UNKNOWN,
          path: triggerPath,
          message: `Capability "${capability}" is not defined in capability manifest for consumer surface "${surface}"`,
        });
      }
      continue;
    }

    const capDesc = Object.getOwnPropertyDescriptor(matrix, capability);
    const capRecord = capDesc ? capDesc.value : undefined;

    if (capRecord === null || typeof capRecord !== 'object' || Array.isArray(capRecord)) {
      for (const surface of CONSUMER_SURFACES) {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Capability manifest entry for "${capability}" is not a valid object`,
        });
      }
      continue;
    }

    // 按固定消费面顺序检查六大消费面
    for (const surface of CONSUMER_SURFACES) {
      if (!Object.prototype.hasOwnProperty.call(capRecord, surface)) {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.UNKNOWN,
          path: triggerPath,
          message: `Capability "${capability}" is not defined in capability manifest for consumer surface "${surface}"`,
        });
        continue;
      }

      const surfaceDesc = Object.getOwnPropertyDescriptor(capRecord, surface);
      const entry = surfaceDesc ? surfaceDesc.value : undefined;

      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        recordIssue({
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
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Invalid capability status for "${capability}" on surface "${surface}": expected "supported" or "unsupported", received ${describeValue(status)}`,
        });
        continue;
      }

      if (typeof revision !== 'number' || !Number.isInteger(revision) || revision <= 0) {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
          path: triggerPath,
          message: `Invalid capability revision for "${capability}" on surface "${surface}": expected positive integer, received ${describeValue(revision)}`,
        });
        continue;
      }

      if (status === 'unsupported') {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.UNSUPPORTED,
          path: triggerPath,
          message: `Capability "${capability}" (required revision ${REQUIRED_CAPABILITY_REVISION}) is unsupported by consumer surface "${surface}"`,
        });
        continue;
      }

      if (revision !== REQUIRED_CAPABILITY_REVISION) {
        recordIssue({
          code: CAPABILITY_ISSUE_CODES.REVISION_MISMATCH,
          path: triggerPath,
          message: `Capability "${capability}" revision mismatch on consumer surface "${surface}": required revision ${REQUIRED_CAPABILITY_REVISION}, manifest specifies revision ${revision}`,
        });
        continue;
      }
    }
  }

  return {
    ok: !hasFailure,
    issues,
  };
}
