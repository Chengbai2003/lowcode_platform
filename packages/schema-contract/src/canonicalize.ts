import type { PageSchema } from './types/schema';
import type { ComponentNode } from './types/node';
import type { ActionList, Action } from './actions/action-union';
import type { JsonObject, JsonValue } from './types/json';
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

  for (const key of Object.keys(obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }

  return obj;
}

/**
 * 安全重建干净的 JSON 纯对象/数组，彻底剥离原型链与外部引用，并递归深冻结
 */
function cloneAndSanitizeValue(val: unknown): JsonValue {
  if (
    val === null ||
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  ) {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => cloneAndSanitizeValue(item));
  }

  if (typeof val === 'object') {
    const cleanObj: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(val)) {
      if (typeof v !== 'function' && typeof v !== 'symbol' && typeof v !== 'bigint') {
        cleanObj[k] = cloneAndSanitizeValue(v);
      }
    }
    return cleanObj;
  }

  return null;
}

/**
 * 创建标准化且深冻结的 PageSchema 纯对象
 */
export function createCanonicalPageSchema(validated: PageSchema): PageSchema {
  const cleanComponents: Record<string, ComponentNode> = {};

  for (const [id, comp] of Object.entries(validated.components)) {
    const cleanComp: ComponentNode = {
      id: comp.id,
      type: comp.type,
      props: comp.props ? (cloneAndSanitizeValue(comp.props) as JsonObject) : undefined,
      childrenIds: comp.childrenIds ? [...comp.childrenIds] : undefined,
      events: comp.events
        ? (cloneAndSanitizeValue(comp.events) as unknown as Record<string, ActionList>)
        : undefined,
    };
    cleanComponents[id] = cleanComp;
  }

  const canonicalSchema: PageSchema = {
    schemaVersion: validated.schemaVersion,
    rootId: validated.rootId,
    components: cleanComponents,
  };

  return deepFreeze(canonicalSchema);
}

/**
 * 全消费面统一断言：校验 PageSchema 是否合法且为受支持版本
 * 失败时 Fail-Close 抛出标准 SchemaContractError
 */
export function assertSupportedPageSchema(schema: unknown): asserts schema is PageSchema {
  const result = validatePageSchemaValue(schema);
  if (!result.ok) {
    const unsupportedIssue = result.issues.find((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION');
    if (unsupportedIssue) {
      const version = (schema as Record<string, unknown>)?.schemaVersion;
      throw new UnsupportedSchemaVersionError(version);
    }
    throw new SchemaValidationError(result.issues);
  }
}
