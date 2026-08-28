import type { JsonValue, JsonObject, JsonArray } from '../types/json';
import type { SchemaContractIssue } from './issues';

export interface InspectionContext {
  readonly issues: SchemaContractIssue[];
  readonly seen: Set<object>;
  readonly maxDepth: number;
  readonly maxNodes: number;
  nodeCount: number;
}

/**
 * 递归安全检查与清洗 JSON 值
 * 1. 严格使用 data descriptor 读取，绝不触发 getter/setter；
 * 2. 拒绝 function, symbol, bigint, Date, RegExp, Map, Set, 类实例；
 * 3. 拒绝 NaN, Infinity, -Infinity 与稀疏数组；
 * 4. 检测循环引用与深度/节点数超限；
 * 5. 使用 Object.defineProperty / null 原型，杜绝 __proto__ 原型污染。
 */
export function inspectAndSanitizeJsonValue(
  value: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: InspectionContext,
): JsonValue | undefined {
  context.nodeCount++;
  if (context.nodeCount > context.maxNodes) {
    context.issues.push({
      code: 'SCHEMA_BUDGET_EXCEEDED',
      path,
      message: `Total node count exceeded limit of ${context.maxNodes}`,
    });
    return undefined;
  }

  if (depth > context.maxDepth) {
    context.issues.push({
      code: 'SCHEMA_DEPTH_EXCEEDED',
      path,
      message: `Nesting depth exceeded limit of ${context.maxDepth}`,
    });
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === 'boolean' || valueType === 'string') {
    return value as boolean | string;
  }

  if (valueType === 'number') {
    if (!Number.isFinite(value as number)) {
      context.issues.push({
        code: 'NON_FINITE_NUMBER',
        path,
        message: `Number must be a finite value, received: ${String(value)}`,
      });
      return undefined;
    }
    return value as number;
  }

  if (valueType === 'function') {
    context.issues.push({
      code: 'FUNCTION_FORBIDDEN',
      path,
      message: 'Functions are permanently forbidden in Schema JSON',
    });
    return undefined;
  }

  if (valueType === 'symbol') {
    context.issues.push({
      code: 'SYMBOL_FORBIDDEN',
      path,
      message: 'Symbols are forbidden in Schema JSON',
    });
    return undefined;
  }

  if (valueType === 'bigint') {
    context.issues.push({
      code: 'BIGINT_FORBIDDEN',
      path,
      message: 'BigInt is forbidden in Schema JSON',
    });
    return undefined;
  }

  if (valueType === 'undefined') {
    context.issues.push({
      code: 'UNDEFINED_VALUE_FORBIDDEN',
      path,
      message: 'undefined values are not allowed in Schema JSON',
    });
    return undefined;
  }

  if (valueType === 'object') {
    const obj = value as object;

    // 循环引用检测
    if (context.seen.has(obj)) {
      context.issues.push({
        code: 'CIRCULAR_REFERENCE',
        path,
        message: 'Circular reference detected in Schema JSON structure',
      });
      return undefined;
    }

    context.seen.add(obj);

    try {
      if (Array.isArray(obj)) {
        const cleanArray: JsonValue[] = [];
        for (let i = 0; i < obj.length; i++) {
          if (!Object.prototype.hasOwnProperty.call(obj, i)) {
            context.issues.push({
              code: 'SPARSE_ARRAY_FORBIDDEN',
              path: [...path, i],
              message: 'Sparse arrays are forbidden in Schema JSON',
            });
            continue;
          }
          const item = inspectAndSanitizeJsonValue(obj[i], [...path, i], depth + 1, context);
          if (item !== undefined) {
            cleanArray.push(item);
          }
        }
        return cleanArray as JsonArray;
      }

      // 类实例 / 内置复杂对象拒绝
      if (
        obj instanceof Date ||
        obj instanceof RegExp ||
        obj instanceof Map ||
        obj instanceof Set ||
        obj instanceof Promise
      ) {
        context.issues.push({
          code: 'CLASS_INSTANCE_FORBIDDEN',
          path,
          message: `Class instances (${(obj as any).constructor?.name ?? 'Object'}) are forbidden in Schema JSON`,
        });
        return undefined;
      }

      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        context.issues.push({
          code: 'INVALID_OBJECT_PROTOTYPE',
          path,
          message: 'Objects in Schema JSON must be plain objects or null-prototype objects',
        });
        return undefined;
      }

      // Symbol 属性检查
      const symbols = Object.getOwnPropertySymbols(obj);
      if (symbols.length > 0) {
        context.issues.push({
          code: 'SYMBOL_PROPERTY_FORBIDDEN',
          path,
          message: `Symbol property keys (${symbols.map((s) => s.toString()).join(', ')}) are forbidden in Schema JSON`,
        });
      }

      const cleanObj: Record<string, JsonValue> = Object.create(null);
      const propNames = Object.getOwnPropertyNames(obj);

      for (const key of propNames) {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (!desc) continue;

        // 访问器属性 (getter/setter) 直接拒绝，绝对不调用 getter
        if (desc.get || desc.set) {
          context.issues.push({
            code: 'ACCESSOR_PROPERTY_FORBIDDEN',
            path: [...path, key],
            message: `Property "${key}" must not be an accessor (getter/setter)`,
          });
          continue;
        }

        if ('value' in desc) {
          const childVal = inspectAndSanitizeJsonValue(
            desc.value,
            [...path, key],
            depth + 1,
            context,
          );
          if (childVal !== undefined) {
            // 使用 Object.defineProperty 避免 key 为 '__proto__' 时的原型污染
            Object.defineProperty(cleanObj, key, {
              value: childVal,
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
        }
      }

      return cleanObj as JsonObject;
    } finally {
      context.seen.delete(obj);
    }
  }

  return undefined;
}
