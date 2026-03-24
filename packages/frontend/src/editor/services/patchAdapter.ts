import type { A2UIComponent, A2UISchema, ActionList } from '../../types';
import type { EditorPatchOperation } from '../types/patch';

interface MutableComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
  events?: A2UIComponent['events'];
}

type MutableSchema = {
  version?: number;
  rootId: string;
  components: Record<string, MutableComponent>;
};

export function applyPatchToSchema(
  schema: A2UISchema,
  patch: readonly EditorPatchOperation[],
): A2UISchema {
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
    }
  }

  return freezeSchema(nextSchema);
}

function insertComponent(
  schema: MutableSchema,
  parentId: string,
  component: A2UIComponent,
  index?: number,
) {
  const parent = schema.components[parentId];
  parent.childrenIds = [...(parent.childrenIds ?? [])];

  schema.components[component.id] = {
    id: component.id,
    type: component.type,
    props: component.props ? { ...component.props } : {},
    childrenIds: [...(component.childrenIds ?? [])],
    events: component.events ? { ...component.events } : {},
  };

  const insertAt = index === undefined ? parent.childrenIds.length : index;
  parent.childrenIds.splice(insertAt, 0, component.id);
}

function updateProps(schema: MutableSchema, componentId: string, props: Record<string, unknown>) {
  const component = schema.components[componentId];
  component.props = {
    ...(component.props ?? {}),
    ...props,
  };
}

function bindEvent(schema: MutableSchema, componentId: string, event: string, actions: ActionList) {
  const component = schema.components[componentId];
  component.events = {
    ...(component.events ?? {}),
    [event]: actions.map((action) => ({ ...action })),
  };
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

function cloneSchema(schema: A2UISchema): MutableSchema {
  const components = Object.entries(schema.components).reduce<Record<string, MutableComponent>>(
    (accumulator, [id, component]) => {
      accumulator[id] = {
        id: component.id,
        type: component.type,
        props: component.props ? { ...component.props } : {},
        childrenIds: [...(component.childrenIds ?? [])],
        events: component.events ? { ...component.events } : {},
      };
      return accumulator;
    },
    {},
  );

  return {
    version: schema.version,
    rootId: schema.rootId,
    components,
  };
}

function freezeSchema(schema: MutableSchema): A2UISchema {
  const components = Object.entries(schema.components).reduce<Record<string, A2UIComponent>>(
    (accumulator, [id, component]) => {
      accumulator[id] = {
        id: component.id,
        type: component.type,
        props: component.props ? { ...component.props } : undefined,
        childrenIds: component.childrenIds ? [...component.childrenIds] : undefined,
        events: component.events ? { ...component.events } : undefined,
      };
      return accumulator;
    },
    {},
  );

  return {
    version: schema.version,
    rootId: schema.rootId,
    components,
  };
}
