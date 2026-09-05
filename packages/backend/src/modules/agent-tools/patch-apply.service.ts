import type { JsonObject, PageLogic } from '@lowcode-platform/schema-contract';
import { Injectable } from '@nestjs/common';
import { PageSchema, ComponentNode } from '@lowcode-platform/schema-contract';
import { EditorPatchOperation } from './types/editor-patch.types';

interface MutableComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
  events?: Record<string, unknown>;
}

type MutableSchema = {
  schemaVersion: 0;
  rootId: string;
  components: Record<string, MutableComponent>;
  logic?: PageLogic;
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
  for (const [k, v] of Object.entries(value)) {
    result[k] = deepClonePlainValue(v);
  }
  return result as T;
}

@Injectable()
export class PatchApplyService {
  applyPatch(schema: PageSchema, patch: readonly EditorPatchOperation[]): PageSchema {
    const nextSchema = this.cloneSchema(schema);

    for (const operation of patch) {
      switch (operation.op) {
        case 'insertComponent':
          this.insertComponent(
            nextSchema,
            operation.parentId,
            operation.component,
            operation.index,
          );
          break;
        case 'updateProps':
          this.updateProps(nextSchema, operation.componentId, operation.props);
          break;
        case 'bindEvent':
          this.bindEvent(nextSchema, operation.componentId, operation.event, operation.actions);
          break;
        case 'removeComponent':
          this.removeComponent(nextSchema, operation.componentId);
          break;
        case 'moveComponent':
          this.moveComponent(
            nextSchema,
            operation.componentId,
            operation.newParentId,
            operation.newIndex,
          );
          break;
        case 'replacePageLogic':
          this.replacePageLogic(nextSchema, operation.logic);
          break;
      }
    }

    return this.freezeSchema(nextSchema);
  }

  private replacePageLogic(schema: MutableSchema, logic?: Record<string, unknown>) {
    schema.logic = logic ? (deepClonePlainValue(logic) as PageLogic) : undefined;
  }

  private insertComponent(
    schema: MutableSchema,
    parentId: string,
    component: Record<string, unknown>,
    index?: number,
  ) {
    const typedComponent = component as unknown as MutableComponent;
    const parent = schema.components[parentId];
    parent.childrenIds = [...(parent.childrenIds ?? [])];

    schema.components[typedComponent.id] = {
      id: typedComponent.id,
      type: typedComponent.type,
      props: typedComponent.props ? deepClonePlainValue(typedComponent.props) : undefined,
      childrenIds: typedComponent.childrenIds ? [...typedComponent.childrenIds] : undefined,
      events: typedComponent.events ? deepClonePlainValue(typedComponent.events) : undefined,
    };

    const insertAt = index === undefined ? parent.childrenIds.length : index;
    parent.childrenIds.splice(insertAt, 0, typedComponent.id);
  }

  private updateProps(schema: MutableSchema, componentId: string, props: Record<string, unknown>) {
    const component = schema.components[componentId];
    component.props = {
      ...(component.props ?? {}),
      ...deepClonePlainValue(props),
    };
  }

  private bindEvent(
    schema: MutableSchema,
    componentId: string,
    event: string,
    actions: Array<Record<string, unknown>>,
  ) {
    const component = schema.components[componentId];
    component.events = {
      ...(component.events ?? {}),
      [event]: deepClonePlainValue(actions),
    };
  }

  private removeComponent(schema: MutableSchema, componentId: string) {
    const parent = this.findParent(schema, componentId);
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

  private moveComponent(
    schema: MutableSchema,
    componentId: string,
    newParentId: string,
    newIndex: number,
  ) {
    const oldParent = this.findParent(schema, componentId);
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

  private findParent(schema: MutableSchema, componentId: string): MutableComponent | undefined {
    return Object.values(schema.components).find((component) =>
      (component.childrenIds ?? []).includes(componentId),
    );
  }

  private cloneSchema(schema: PageSchema): MutableSchema {
    const components = Object.entries(schema.components).reduce<Record<string, MutableComponent>>(
      (accumulator, [id, component]) => {
        accumulator[id] = {
          id: component.id,
          type: component.type,
          props: component.props ? deepClonePlainValue(component.props) : undefined,
          childrenIds: component.childrenIds ? [...component.childrenIds] : undefined,
          events: component.events ? deepClonePlainValue(component.events) : undefined,
        };
        return accumulator;
      },
      {},
    );

    return {
      schemaVersion: schema.schemaVersion,
      rootId: schema.rootId,
      components,
      logic: schema.logic ? (deepClonePlainValue(schema.logic) as PageLogic) : undefined,
    };
  }

  private freezeSchema(schema: MutableSchema): PageSchema {
    const components = Object.entries(schema.components).reduce<Record<string, ComponentNode>>(
      (accumulator, [id, component]) => {
        accumulator[id] = {
          id: component.id,
          type: component.type,
          ...(component.props !== undefined ? { props: component.props as JsonObject } : {}),
          ...(component.childrenIds !== undefined ? { childrenIds: component.childrenIds } : {}),
          ...(component.events !== undefined
            ? { events: component.events as unknown as ComponentNode['events'] }
            : {}),
        };
        return accumulator;
      },
      {},
    );

    return {
      schemaVersion: schema.schemaVersion,
      rootId: schema.rootId,
      components,
      ...(schema.logic !== undefined ? { logic: schema.logic } : {}),
    };
  }
}
