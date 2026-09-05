import type { ComponentNode, PageSchema, ActionList } from '../../types';
import type { EditorPatchOperation } from '../types/patch';

interface MutableComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
  events?: ComponentNode['events'];
}

type MutableSchema = {
  schemaVersion: 0;
  rootId: string;
  components: Record<string, MutableComponent>;
  logic?: PageSchema['logic'];
};

function deepClonePlainValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClonePlainValue(item)) as unknown as T;
  }
  const proto = Object.getPrototypeOf(value);
  const result: Record<string, unknown> = proto === null ? Object.create(null) : {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || desc.get || desc.set) continue;
    Object.defineProperty(result, key, {
      value: deepClonePlainValue(desc.value),
      enumerable: desc.enumerable,
      writable: true,
      configurable: true,
    });
  }
  return result as T;
}

function mergePlainObjects(
  target: Record<string, unknown> | undefined,
  source: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (target) {
    for (const key of Object.getOwnPropertyNames(target)) {
      const desc = Object.getOwnPropertyDescriptor(target, key);
      if (desc && !desc.get && !desc.set && 'value' in desc) {
        Object.defineProperty(result, key, {
          value: deepClonePlainValue(desc.value),
          enumerable: desc.enumerable,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  if (source) {
    for (const key of Object.getOwnPropertyNames(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (desc && !desc.get && !desc.set && 'value' in desc) {
        Object.defineProperty(result, key, {
          value: deepClonePlainValue(desc.value),
          enumerable: desc.enumerable,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  return result;
}

export function applyPatchToSchema(
  schema: PageSchema,
  patch: readonly EditorPatchOperation[],
): PageSchema {
  const nextSchema = cloneSchema(schema);

  for (const operation of patch) {
    switch (operation.op) {
      case 'insertComponent':
        insertComponent(nextSchema, operation.parentId, operation.component, operation.index);
        break;
      case 'updateProps':
        updateProps(nextSchema, operation.componentId, operation.props);
        break;
      case 'bindEvent':
        bindEvent(nextSchema, operation.componentId, operation.event, operation.actions);
        break;
      case 'removeComponent':
        removeComponent(nextSchema, operation.componentId);
        break;
      case 'moveComponent':
        moveComponent(nextSchema, operation.componentId, operation.newParentId, operation.newIndex);
        break;
      case 'replacePageLogic':
        replacePageLogic(nextSchema, operation.logic);
        break;
    }
  }

  return freezeSchema(nextSchema);
}

function replacePageLogic(schema: MutableSchema, logic?: Record<string, unknown>) {
  schema.logic = logic ? (deepClonePlainValue(logic) as PageSchema['logic']) : undefined;
}

function insertComponent(
  schema: MutableSchema,
  parentId: string,
  component: ComponentNode,
  index?: number,
) {
  const parent = schema.components[parentId];
  parent.childrenIds = [...(parent.childrenIds ?? [])];

  const newComp: MutableComponent = {
    id: component.id,
    type: component.type,
    props: component.props ? deepClonePlainValue(component.props) : undefined,
    childrenIds: component.childrenIds ? [...component.childrenIds] : undefined,
    events: component.events ? deepClonePlainValue(component.events) : undefined,
  };

  Object.defineProperty(schema.components, component.id, {
    value: newComp,
    enumerable: true,
    writable: true,
    configurable: true,
  });

  const insertAt = index === undefined ? parent.childrenIds.length : index;
  parent.childrenIds.splice(insertAt, 0, component.id);
}

function updateProps(schema: MutableSchema, componentId: string, props: Record<string, unknown>) {
  const component = schema.components[componentId];
  component.props = mergePlainObjects(component.props, props);
}

function bindEvent(schema: MutableSchema, componentId: string, event: string, actions: ActionList) {
  const component = schema.components[componentId];
  const events: Record<string, unknown> = {};
  if (component.events) {
    for (const key of Object.getOwnPropertyNames(component.events)) {
      const desc = Object.getOwnPropertyDescriptor(component.events, key);
      if (desc && !desc.get && !desc.set && 'value' in desc) {
        Object.defineProperty(events, key, {
          value: deepClonePlainValue(desc.value),
          enumerable: desc.enumerable,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  Object.defineProperty(events, event, {
    value: deepClonePlainValue(actions),
    enumerable: true,
    writable: true,
    configurable: true,
  });
  component.events = events as ComponentNode['events'];
}

function removeComponent(schema: MutableSchema, componentId: string) {
  const parent = findParent(schema, componentId);
  if (parent) {
    parent.childrenIds = (parent.childrenIds ?? []).filter((childId) => childId !== componentId);
  }

  const toDelete = new Set<string>();
  const stack = [componentId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (toDelete.has(currentId)) {
      continue;
    }

    toDelete.add(currentId);
    const current = schema.components[currentId];
    for (const childId of current?.childrenIds ?? []) {
      if (schema.components[childId]) {
        stack.push(childId);
      }
    }
  }

  for (const id of toDelete) {
    delete schema.components[id];
  }
}

function moveComponent(
  schema: MutableSchema,
  componentId: string,
  newParentId: string,
  newIndex: number,
) {
  const oldParent = findParent(schema, componentId);
  const newParent = schema.components[newParentId];

  if (oldParent) {
    oldParent.childrenIds = (oldParent.childrenIds ?? []).filter(
      (childId) => childId !== componentId,
    );
  }

  const targetChildren = [...(newParent.childrenIds ?? [])];
  const insertAt = Math.max(0, Math.min(newIndex, targetChildren.length));
  targetChildren.splice(insertAt, 0, componentId);
  newParent.childrenIds = targetChildren;
}

function findParent(schema: MutableSchema, componentId: string): MutableComponent | undefined {
  return Object.values(schema.components).find((component) =>
    (component.childrenIds ?? []).includes(componentId),
  );
}

function cloneSchema(schema: PageSchema): MutableSchema {
  const components: Record<string, MutableComponent> = {};
  for (const id of Object.getOwnPropertyNames(schema.components)) {
    const desc = Object.getOwnPropertyDescriptor(schema.components, id);
    if (!desc || desc.get || desc.set || !desc.value) continue;
    const component = desc.value as ComponentNode;
    const clonedComp: MutableComponent = {
      id: component.id,
      type: component.type,
      props: component.props ? deepClonePlainValue(component.props) : undefined,
      childrenIds: component.childrenIds ? [...component.childrenIds] : undefined,
      events: component.events ? deepClonePlainValue(component.events) : undefined,
    };
    Object.defineProperty(components, id, {
      value: clonedComp,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  const mutable: MutableSchema = {
    schemaVersion: schema.schemaVersion,
    rootId: schema.rootId,
    components,
  };
  if (schema.logic !== undefined) {
    mutable.logic = deepClonePlainValue(schema.logic) as PageSchema['logic'];
  }
  return mutable;
}

function freezeSchema(schema: MutableSchema): PageSchema {
  const components: Record<string, ComponentNode> = {};
  for (const id of Object.getOwnPropertyNames(schema.components)) {
    const desc = Object.getOwnPropertyDescriptor(schema.components, id);
    if (!desc || desc.get || desc.set || !desc.value) continue;
    const component = desc.value as MutableComponent;
    const compNode: Record<string, unknown> = {
      id: component.id,
      type: component.type,
    };
    if (component.props !== undefined) {
      compNode.props = component.props;
    }
    if (component.childrenIds !== undefined) {
      compNode.childrenIds = component.childrenIds;
    }
    if (component.events !== undefined) {
      compNode.events = component.events;
    }
    Object.defineProperty(components, id, {
      value: compNode as unknown as ComponentNode,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return {
    schemaVersion: schema.schemaVersion,
    rootId: schema.rootId,
    components,
    ...(schema.logic !== undefined ? { logic: schema.logic } : {}),
  };
}
