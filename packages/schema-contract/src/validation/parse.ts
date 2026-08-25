import { isSupportedSchemaVersion } from '../types/versions';
import type { PageSchema } from '../types/schema';
import type { ComponentNode } from '../types/node';
import type { ParsePageSchemaResult, SchemaContractIssue } from './issues';
import { validateComponentGraph } from './tree';
import { validateActionList, hasCustomScriptInValue } from './actions';

export const MAX_SCHEMA_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const hasOwn = (target: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/**
 * 安全解析 JSON 字符串为 PageSchema，先行检查原始字节长度
 */
export function parsePageSchemaJson(
  rawJson: string,
  maxSizeBytes: number = MAX_SCHEMA_SIZE_BYTES,
): ParsePageSchemaResult {
  if (typeof rawJson !== 'string') {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_JSON_INPUT',
          path: [],
          message: 'Input must be a JSON string',
        },
      ],
    };
  }

  // 环境无关的 UTF-8 字节计算 (兼容浏览器与 Node.js，不依赖 Node Buffer)
  const byteLength = new TextEncoder().encode(rawJson).length;
  if (byteLength > maxSizeBytes) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_SIZE_EXCEEDED',
          path: [],
          message: `Schema size (${byteLength} bytes) exceeds limit of ${maxSizeBytes} bytes`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          code: 'JSON_PARSE_ERROR',
          path: [],
          message: err instanceof Error ? err.message : 'Malformed JSON',
        },
      ],
    };
  }

  return validatePageSchemaValue(parsed);
}

/**
 * 校验未知输入是否为合法的 PageSchema 数据结构
 */
export function validatePageSchemaValue(input: unknown): ParsePageSchemaResult {
  const issues: SchemaContractIssue[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_SCHEMA_OBJECT',
          path: [],
          message: 'PageSchema must be an object',
        },
      ],
    };
  }

  // 属性描述符安全检查：拒绝 getter / setter
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const [key, desc] of Object.entries(descriptors)) {
    if (desc.get || desc.set) {
      issues.push({
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [key],
        message: `Schema property "${key}" must not be an accessor (getter/setter)`,
      });
    }
  }

  const typedSchema = input as Record<string, unknown>;

  // 1. schemaVersion 校验
  const schemaVersion = typedSchema.schemaVersion;
  if (schemaVersion === undefined) {
    issues.push({
      code: 'SCHEMA_VERSION_REQUIRED',
      path: ['schemaVersion'],
      message: 'schemaVersion is required on PageSchema',
    });
  } else if (!isSupportedSchemaVersion(schemaVersion)) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: ['schemaVersion'],
      message: `Unsupported schemaVersion: ${String(schemaVersion)}`,
    });
  }

  // 2. rootId 校验
  const rootId = typedSchema.rootId;
  if (typeof rootId !== 'string' || !rootId.trim()) {
    issues.push({
      code: 'ROOT_ID_REQUIRED',
      path: ['rootId'],
      message: 'Schema rootId is required and must be a non-empty string',
    });
  }

  // 3. components 校验
  const components = typedSchema.components;
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    issues.push({
      code: 'COMPONENTS_OBJECT_REQUIRED',
      path: ['components'],
      message: 'Schema components must be an object',
    });
    return { ok: false, issues };
  }

  const typedComponents = components as Record<string, unknown>;

  if (typeof rootId === 'string' && rootId.trim() && !hasOwn(typedComponents, rootId)) {
    issues.push({
      code: 'ROOT_NODE_MISSING',
      path: ['components', rootId],
      message: `Schema rootId "${rootId}" does not exist in components`,
    });
  }

  const validComponentNodes: Record<string, ComponentNode> = {};

  for (const [componentId, component] of Object.entries(typedComponents)) {
    const compPath = ['components', componentId];

    if (!component || typeof component !== 'object' || Array.isArray(component)) {
      issues.push({
        code: 'INVALID_COMPONENT_OBJECT',
        path: compPath,
        message: `Component "${componentId}" must be an object`,
      });
      continue;
    }

    const typedComp = component as Record<string, unknown>;

    if (typeof typedComp.type !== 'string' || !typedComp.type.trim()) {
      issues.push({
        code: 'COMPONENT_TYPE_REQUIRED',
        path: [...compPath, 'type'],
        message: `Component "${componentId}" type is required`,
      });
    }

    if (typeof typedComp.id !== 'string' || !typedComp.id.trim()) {
      issues.push({
        code: 'COMPONENT_ID_REQUIRED',
        path: [...compPath, 'id'],
        message: `Component "${componentId}" id is required`,
      });
    } else if (typedComp.id !== componentId) {
      issues.push({
        code: 'COMPONENT_ID_MISMATCH',
        path: [...compPath, 'id'],
        message: `Component id "${typedComp.id}" must match its key "${componentId}"`,
      });
    }

    if (typedComp.childrenIds !== undefined) {
      if (!Array.isArray(typedComp.childrenIds)) {
        issues.push({
          code: 'INVALID_CHILDREN_IDS',
          path: [...compPath, 'childrenIds'],
          message: `Component "${componentId}" childrenIds must be an array`,
        });
      } else {
        const seenChildIds = new Set<string>();
        for (let idx = 0; idx < typedComp.childrenIds.length; idx++) {
          const childId = typedComp.childrenIds[idx];
          if (typeof childId !== 'string' || !hasOwn(typedComponents, childId)) {
            issues.push({
              code: 'MISSING_CHILD_REFERENCE',
              path: [...compPath, 'childrenIds', idx],
              message: `Component "${componentId}" references missing child "${String(childId)}"`,
            });
          }
          if (typeof childId === 'string') {
            if (seenChildIds.has(childId)) {
              issues.push({
                code: 'DUPLICATE_CHILD_REFERENCE',
                path: [...compPath, 'childrenIds', idx],
                message: `Component "${componentId}" references child "${childId}" more than once`,
              });
            }
            seenChildIds.add(childId);
          }
        }
      }
    }

    if (typedComp.events !== undefined) {
      if (
        !typedComp.events ||
        typeof typedComp.events !== 'object' ||
        Array.isArray(typedComp.events)
      ) {
        issues.push({
          code: 'INVALID_EVENTS_OBJECT',
          path: [...compPath, 'events'],
          message: `Component "${componentId}" events must be an object`,
        });
      } else {
        for (const [eventName, actions] of Object.entries(
          typedComp.events as Record<string, unknown>,
        )) {
          validateActionList(actions, [...compPath, 'events', eventName], issues);
        }
      }
    }

    if (typedComp.props !== undefined) {
      if (
        !typedComp.props ||
        typeof typedComp.props !== 'object' ||
        Array.isArray(typedComp.props)
      ) {
        issues.push({
          code: 'INVALID_PROPS_OBJECT',
          path: [...compPath, 'props'],
          message: `Component "${componentId}" props must be an object`,
        });
      } else if (hasCustomScriptInValue(typedComp.props)) {
        issues.push({
          code: 'FORBIDDEN_CUSTOM_SCRIPT_IN_PROPS',
          path: [...compPath, 'props'],
          message: 'customScript is permanently forbidden in component props',
        });
      }
    }

    validComponentNodes[componentId] = component as ComponentNode;
  }

  // 4. 组件拓扑图合法性校验 (成环、多父、孤儿)
  if (typeof rootId === 'string' && rootId.trim() && issues.length === 0) {
    validateComponentGraph(rootId, typedComponents as Record<string, ComponentNode>, issues);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: input as PageSchema,
  };
}
