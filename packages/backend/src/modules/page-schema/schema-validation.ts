import { BadRequestException } from '@nestjs/common';
import { MAX_SCHEMA_SIZE_BYTES } from './dto/save-page-schema.dto';
import { getActionValidationError, hasCustomScriptInValue } from './action-validation';

interface A2UIComponentShape {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
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

    if (typeof typedComponent.id !== 'string' || !typedComponent.id.trim()) {
      throw new BadRequestException(`Component ${componentId} id is required`);
    }
    if (typedComponent.id !== componentId) {
      throw new BadRequestException(`Component ${componentId} id must match its key`);
    }

    if (typedComponent.childrenIds !== undefined && !Array.isArray(typedComponent.childrenIds)) {
      throw new BadRequestException(`Component ${componentId} childrenIds must be an array`);
    }
    if (
      typedComponent.events !== undefined &&
      (!typedComponent.events ||
        typeof typedComponent.events !== 'object' ||
        Array.isArray(typedComponent.events))
    ) {
      throw new BadRequestException(`Component ${componentId} events must be an object`);
    }

    if (Array.isArray(typedComponent.childrenIds)) {
      const childIds = new Set<string>();
      for (const childId of typedComponent.childrenIds) {
        if (typeof childId !== 'string' || !(childId in components)) {
          throw new BadRequestException(
            `Component ${componentId} references missing child ${String(childId)}`,
          );
        }
        if (childIds.has(childId)) {
          throw new BadRequestException(
            `Component ${componentId} references child ${childId} more than once`,
          );
        }
        childIds.add(childId);
      }
    }
  }

  assertValidComponentGraph(typedSchema as A2UISchemaShape);
  assertValidComponentActions(typedSchema as A2UISchemaShape);
}

function assertValidComponentActions(schema: A2UISchemaShape): void {
  for (const component of Object.values(schema.components)) {
    assertValidComponentActionsForComponent(component as A2UIComponentShape);
  }
}

function assertValidComponentActionsForComponent(component: A2UIComponentShape): void {
  if (
    component.events &&
    typeof component.events === 'object' &&
    !Array.isArray(component.events)
  ) {
    for (const actions of Object.values(component.events)) {
      const error = getActionValidationError(actions);
      if (error) throw new BadRequestException(error);
    }
  }
  if (component.props && hasCustomScriptInValue(component.props)) {
    throw new BadRequestException('customScript is not allowed in schema');
  }
}

function assertValidComponentGraph(schema: A2UISchemaShape): void {
  const parentCounts = new Map<string, number>();
  for (const component of Object.values(schema.components)) {
    for (const childId of component.childrenIds ?? []) {
      const count = (parentCounts.get(childId) ?? 0) + 1;
      if (count > 1) throw new BadRequestException(`Component ${childId} has multiple parents`);
      parentCounts.set(childId, count);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (componentId: string) => {
    if (visiting.has(componentId))
      throw new BadRequestException('Schema contains a component cycle');
    if (visited.has(componentId)) return;
    visiting.add(componentId);
    for (const childId of schema.components[componentId].childrenIds ?? []) visit(childId);
    visiting.delete(componentId);
    visited.add(componentId);
  };
  for (const componentId of Object.keys(schema.components)) visit(componentId);

  const reachable = new Set<string>();
  const stack = [schema.rootId];
  while (stack.length) {
    const componentId = stack.pop()!;
    if (reachable.has(componentId)) continue;
    reachable.add(componentId);
    stack.push(...(schema.components[componentId].childrenIds ?? []));
  }
  for (const [componentId, component] of Object.entries(schema.components)) {
    if (!reachable.has(componentId) && !isDetachedHiddenDataNode(component)) {
      throw new BadRequestException(`Schema contains orphaned components: ${componentId}`);
    }
  }
}

function isDetachedHiddenDataNode(component: A2UIComponentShape): boolean {
  const props = component.props;
  return (
    component.type === 'Div' &&
    props?.visible === false &&
    Object.prototype.hasOwnProperty.call(props, 'initialValue') &&
    (component.childrenIds?.length ?? 0) === 0
  );
}
