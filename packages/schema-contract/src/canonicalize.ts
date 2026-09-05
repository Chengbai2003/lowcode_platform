import type { PageSchema } from './types/schema';
import type { SchemaValidationLimits } from './types/limits';
import { validatePageSchemaValue } from './validation/parse';
import { SchemaValidationError, UnsupportedSchemaVersionError } from './validation/issues';
import { evaluatePageSchemaCapabilities } from './capabilities/evaluate';
import { getTrustedCapabilityManifest } from './capabilities/manifest';
export { deepFreeze } from './internal/freeze';

function safeReadVersion(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const desc = Object.getOwnPropertyDescriptor(input as object, 'schemaVersion');
  if (!desc || desc.get || desc.set || !('value' in desc)) return undefined;
  return desc.value;
}

/**
 * 创建标准化、安全剥离原型链且深冻结的 PageSchema 纯对象。
 *
 * 校验与重建是同一条链路：内部完整重跑 descriptor-safe 校验
 * （结构校验 + Action 结构校验 + 拓扑校验 + 预算检查），
 * 成功时返回由 validatePageSchemaValue 重建的 canonical、深冻结新对象；
 * 存在任何 issue 时 fail-close 抛出 SchemaValidationError，绝不静默清洗。
 *
 * 入参为 unknown：即使消费方传入未校验或被 TOCTOU 变异过的对象，
 * 也无法绕过校验链拿到 canonical 结果。
 */
export function createCanonicalPageSchema(input: unknown): PageSchema {
  const result = validatePageSchemaValue(input);
  if (!result.ok) {
    const unsupportedIssue = result.issues.find((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION');
    if (unsupportedIssue) {
      throw new UnsupportedSchemaVersionError(safeReadVersion(input));
    }
    throw new SchemaValidationError(result.issues);
  }
  return result.value;
}

/**
 * 全消费面统一断言：校验 PageSchema 是否合法且为受支持版本
 * 失败时 Fail-Close 抛出标准 SchemaContractError
 */
export function assertSupportedPageSchema(
  schema: unknown,
  limits?: Partial<SchemaValidationLimits>,
): asserts schema is PageSchema {
  const result = validatePageSchemaValue(schema, limits);
  if (!result.ok) {
    const unsupportedIssue = result.issues.find((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION');
    if (unsupportedIssue) {
      throw new UnsupportedSchemaVersionError(safeReadVersion(schema));
    }
    throw new SchemaValidationError(result.issues);
  }
  const capResult = evaluatePageSchemaCapabilities(result.value, getTrustedCapabilityManifest());
  if (!capResult.ok) {
    throw new SchemaValidationError(capResult.issues);
  }
}

/**
 * 安全边界入口：校验并返回 canonical、深冻结的 PageSchema。
 *
 * 与 assertSupportedPageSchema 的语义区分：
 * - `requireSupportedPageSchema` 用于 Compiler / Renderer / Repository / 持久化等
 *   消费链路——必须使用本函数的返回值，不得继续使用原始输入对象；
 * - `assertSupportedPageSchema` 仅用于同步类型断言（返回 void，不提供 canonical 数据）。
 *
 * 任何 issue 时 fail-close 抛出 SchemaValidationError。
 */
export function requireSupportedPageSchema(
  input: unknown,
  limits?: Partial<SchemaValidationLimits>,
): PageSchema {
  const result = validatePageSchemaValue(input, limits);
  if (!result.ok) {
    const unsupportedIssue = result.issues.find((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION');
    if (unsupportedIssue) {
      throw new UnsupportedSchemaVersionError(safeReadVersion(input));
    }
    throw new SchemaValidationError(result.issues);
  }
  const capResult = evaluatePageSchemaCapabilities(result.value, getTrustedCapabilityManifest());
  if (!capResult.ok) {
    throw new SchemaValidationError(capResult.issues);
  }
  return result.value;
}
