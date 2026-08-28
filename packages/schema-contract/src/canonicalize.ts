import type { PageSchema } from './types/schema';
import type { ComponentNode } from './types/node';
import type { ActionList } from './actions/action-union';
import type { JsonObject, JsonValue } from './types/json';
import type { SchemaValidationLimits } from './types/limits';
import { validatePageSchemaValue } from './validation/parse';
import { SchemaValidationError, UnsupportedSchemaVersionError } from './validation/issues';
import type { InspectionContext } from './validation/inspector';
import { inspectAndSanitizeJsonValue } from './validation/inspector';

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

  return obj;
}

/**
 * 创建标准化、安全剥离原型链且深冻结的 PageSchema 纯对象
 * 杜绝 __proto__ 原型污染，安全保留任意合规 JSON key
 */
export function createCanonicalPageSchema(validated: PageSchema): PageSchema {
  const cleanComponents: Record<string, ComponentNode> = Object.create(null);

  const inspectionContext: InspectionContext = {
    issues: [],
    seen: new Set<object>(),
    maxDepth: 64,
    maxNodes: 50000,
    nodeCount: 0,
  };

  for (const id of Object.getOwnPropertyNames(validated.components)) {
    const compDesc = Object.getOwnPropertyDescriptor(validated.components, id);
    if (!compDesc || !('value' in compDesc) || !compDesc.value) continue;

    const comp = compDesc.value as ComponentNode;

    const cleanComp: ComponentNode = {
      id: comp.id,
      type: comp.type,
      props: comp.props
        ? (inspectAndSanitizeJsonValue(comp.props, ['props'], 0, inspectionContext) as JsonObject)
        : undefined,
      childrenIds: comp.childrenIds ? [...comp.childrenIds] : undefined,
      events: comp.events
        ? (inspectAndSanitizeJsonValue(
            comp.events,
            ['events'],
            0,
            inspectionContext,
          ) as unknown as Record<string, ActionList>)
        : undefined,
    };

    // 使用 Object.defineProperty 避免 id 为 '__proto__' 时触发原型修改
    Object.defineProperty(cleanComponents, id, {
      value: cleanComp,
      enumerable: true,
      writable: true,
      configurable: true,
    });
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
export function assertSupportedPageSchema(
  schema: unknown,
  limits?: Partial<SchemaValidationLimits>,
): asserts schema is PageSchema {
  const result = validatePageSchemaValue(schema, limits);
  if (!result.ok) {
    const unsupportedIssue = result.issues.find((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION');
    if (unsupportedIssue) {
      const version = (schema as Record<string, unknown>)?.schemaVersion;
      throw new UnsupportedSchemaVersionError(version);
    }
    throw new SchemaValidationError(result.issues);
  }
}
