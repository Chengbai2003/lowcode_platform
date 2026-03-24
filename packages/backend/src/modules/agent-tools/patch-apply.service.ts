import { Injectable } from '@nestjs/common';
import { A2UIComponent, A2UISchema } from '../schema-context/types/schema.types';
import { EditorPatchOperation } from './types/editor-patch.types';

interface MutableComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
  events?: Record<string, unknown>;
}

type MutableSchema = {
  version?: number;
  rootId: string;
  components: Record<string, MutableComponent>;
};

@Injectable()
export class PatchApplyService {
  applyPatch(schema: A2UISchema, patch: readonly EditorPatchOperation[]): A2UISchema {
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
      }
    }

    return this.freezeSchema(nextSchema);
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
      props: typedComponent.props ? { ...typedComponent.props } : {},
      childrenIds: [...(typedComponent.childrenIds ?? [])],
      events: typedComponent.events ? { ...typedComponent.events } : {},
    };

    const insertAt = index === undefined ? parent.childrenIds.length : index;
    parent.childrenIds.splice(insertAt, 0, typedComponent.id);
  }

  private updateProps(schema: MutableSchema, componentId: string, props: Record<string, unknown>) {
    const component = schema.components[componentId];
    component.props = {
      ...(component.props ?? {}),
      ...props,
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
      [event]: actions.map((action) => ({ ...action })),
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

  private cloneSchema(schema: A2UISchema): MutableSchema {
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

  private freezeSchema(schema: MutableSchema): A2UISchema {
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
}
