import { BadRequestException } from '@nestjs/common';
import { MAX_SCHEMA_SIZE_BYTES } from './dto/save-page-schema.dto';

interface A2UIComponentShape {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  childrenIds?: unknown[];
  events?: Record<string, unknown>;
}

export interface A2UISchemaShape {
  rootId: string;
  components: Record<string, A2UIComponentShape>;
  version?: number;
}

export function assertValidPageSchema(
  schema: unknown,
  maxSizeBytes: number = MAX_SCHEMA_SIZE_BYTES,
): asserts schema is A2UISchemaShape {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new BadRequestException('Schema must be an object');
  }

  const serialized = JSON.stringify(schema);
  if (Buffer.byteLength(serialized, 'utf-8') > maxSizeBytes) {
    throw new BadRequestException(`Schema must not exceed ${maxSizeBytes} bytes`);
  }

  const typedSchema = schema as Partial<A2UISchemaShape>;
  const rootId = typedSchema.rootId;
  const components = typedSchema.components;

  if (typeof rootId !== 'string' || !rootId.trim()) {
    throw new BadRequestException('Schema rootId is required');
  }

  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throw new BadRequestException('Schema components must be an object');
  }

  if (!(rootId in components)) {
    throw new BadRequestException(`Schema rootId ${rootId} does not exist in components`);
  }

  for (const [componentId, component] of Object.entries(components)) {
    if (!component || typeof component !== 'object' || Array.isArray(component)) {
      throw new BadRequestException(`Component ${componentId} must be an object`);
    }

    const typedComponent = component as A2UIComponentShape;
    if (typeof typedComponent.type !== 'string' || !typedComponent.type.trim()) {
      throw new BadRequestException(`Component ${componentId} type is required`);
    }

    if (typedComponent.id !== undefined && typedComponent.id !== componentId) {
      throw new BadRequestException(`Component ${componentId} id must match its key when provided`);
    }

    if (typedComponent.childrenIds !== undefined && !Array.isArray(typedComponent.childrenIds)) {
      throw new BadRequestException(`Component ${componentId} childrenIds must be an array`);
    }

    if (Array.isArray(typedComponent.childrenIds)) {
      for (const childId of typedComponent.childrenIds) {
        if (typeof childId !== 'string' || !(childId in components)) {
          throw new BadRequestException(
            `Component ${componentId} references missing child ${String(childId)}`,
          );
        }
      }
    }
  }

  if (hasCustomScriptInSchema(typedSchema as A2UISchemaShape)) {
    throw new BadRequestException('customScript is not allowed in schema');
  }
}

function hasCustomScriptInSchema(schema: A2UISchemaShape): boolean {
  for (const component of Object.values(schema.components)) {
    if (hasCustomScriptInComponent(component as A2UIComponentShape)) {
      return true;
    }
  }
  return false;
}

function hasCustomScriptInComponent(component: A2UIComponentShape): boolean {
  if (
    component.events &&
    typeof component.events === 'object' &&
    !Array.isArray(component.events)
  ) {
    for (const actions of Object.values(component.events)) {
      if (hasCustomScriptInActions(actions)) {
        return true;
      }
    }
  }
  if (component.props && hasCustomScriptInValue(component.props)) {
    return true;
  }
  return false;
}

function hasCustomScriptInActions(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const action of value) {
    if (hasCustomScriptInAction(action)) {
      return true;
    }
  }
  return false;
}

function hasCustomScriptInAction(action: unknown): boolean {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return false;
  }
  const typed = action as Record<string, unknown>;
  if (typed.type === 'customScript') {
    return true;
  }
  const nestedKeys = ['then', 'else', 'actions', 'onSuccess', 'onError', 'onOk', 'onCancel'];
  for (const key of nestedKeys) {
    const nested = typed[key];
    if (Array.isArray(nested)) {
      for (const nestedAction of nested) {
        if (hasCustomScriptInAction(nestedAction)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasCustomScriptInValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasCustomScriptInValue(item));
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'customScript') {
    return true;
  }
  return Object.values(record).some((v) => hasCustomScriptInValue(v));
}
