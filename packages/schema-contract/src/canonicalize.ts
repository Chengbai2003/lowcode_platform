import type { PageSchema } from './types/schema';
import type { SchemaValidationLimits } from './types/limits';
import { validatePageSchemaValue } from './validation/parse';
import { SchemaValidationError, UnsupportedSchemaVersionError } from './validation/issues';

/**
 * 递归深冻结任意对象与数组
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Object.isFrozen(obj)) {
    return obj;
  }

  Object.freeze(obj);

  const propNames = Object.getOwnPropertyNames(obj);
  for (const key of propNames) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && 'value' in desc) {
      const val = desc.value;
      if (val !== null && typeof val === 'object') {
        deepFreeze(val);
      }
    }
  }
  const symbols = Object.getOwnPropertySymbols(obj);
  for (const sym of symbols) {
    const desc = Object.getOwnPropertyDescriptor(obj, sym);
    if (desc && 'value' in desc && desc.value !== null && typeof desc.value === 'object') {
      deepFreeze(desc.value);
    }
  }

  return obj;
}

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
}
