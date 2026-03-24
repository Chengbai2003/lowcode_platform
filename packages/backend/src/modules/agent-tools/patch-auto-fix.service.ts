import { Injectable } from '@nestjs/common';
import { A2UISchema } from '../schema-context/types/schema.types';
import { EditorPatchOperation } from './types/editor-patch.types';
import { EditorAction } from './types/editor-action.types';

@Injectable()
export class PatchAutoFixService {
  autoFix(patch: readonly EditorPatchOperation[]): {
    patch: EditorPatchOperation[];
    warnings: string[];
  };
  autoFix(
    patch: readonly EditorPatchOperation[],
    schema: A2UISchema,
  ): {
    patch: EditorPatchOperation[];
    warnings: string[];
  };
  autoFix(
    patch: readonly EditorPatchOperation[],
    schema?: A2UISchema,
  ): {
    patch: EditorPatchOperation[];
    warnings: string[];
  } {
    const warnings: string[] = [];
    let workingSchema = schema ? this.cloneSchema(schema) : undefined;

    const normalizedPatch = patch.map((operation) => {
      switch (operation.op) {
        case 'insertComponent': {
          const component =
            operation.component && typeof operation.component === 'object'
              ? { ...operation.component }
              : {};
          const normalizedProps = this.ensureRecord(component.props);
          const buttonPropsNormalization = this.normalizeButtonDangerProps(
            typeof component.type === 'string' ? component.type : undefined,
            normalizedProps,
          );
          if (buttonPropsNormalization.changed) {
            warnings.push(
              `Normalized Button danger prop for inserted component ${String(component.id ?? 'unknown')}`,
            );
          }

          const normalizedComponent = {
            ...component,
            props: buttonPropsNormalization.props,
            childrenIds: this.ensureDistinctStringArray(component.childrenIds),
            events: this.ensureRecord(component.events),
          };

          const normalizedIndex =
            operation.index === undefined || operation.index < 0 ? undefined : operation.index;
          if (operation.index !== normalizedIndex) {
            warnings.push(`Normalized insert index for component under ${operation.parentId}`);
          }

          workingSchema = this.appendInsertedComponent(workingSchema, normalizedComponent);

          return {
            ...operation,
            index: normalizedIndex,
            component: normalizedComponent,
          };
        }
        case 'updateProps': {
          const normalizedProps = this.ensureRecord(operation.props);
          const componentType = workingSchema?.components[operation.componentId]?.type;
          const buttonPropsNormalization = this.normalizeButtonDangerProps(
            componentType,
            normalizedProps,
          );
          if (buttonPropsNormalization.changed) {
            warnings.push(`Normalized Button danger prop for ${operation.componentId}`);
          }

          workingSchema = this.mergeUpdatedProps(
            workingSchema,
            operation.componentId,
            buttonPropsNormalization.props,
          );

          return {
            ...operation,
            props: buttonPropsNormalization.props,
          };
        }
        case 'bindEvent': {
          const { actions, changed } = this.normalizeActionList(operation.actions);
          if (changed) {
            warnings.push(
              `Normalized action payloads for ${operation.componentId}.${operation.event}`,
            );
          }

          return {
            ...operation,
            actions,
          };
        }
        case 'moveComponent': {
          const normalizedIndex = operation.newIndex < 0 ? 0 : operation.newIndex;
          if (normalizedIndex !== operation.newIndex) {
            warnings.push(`Normalized move index for ${operation.componentId}`);
          }

          return {
            ...operation,
            newIndex: normalizedIndex,
          };
        }
        default:
          return { ...operation };
      }
    });

    return {
      patch: normalizedPatch,
      warnings,
    };
  }

  private normalizeActionList(actions: unknown): {
    actions: EditorAction[];
    changed: boolean;
  } {
    if (!Array.isArray(actions)) {
      return {
        actions: [],
        changed: !Array.isArray(actions),
      };
    }

    let changed = false;
    const normalizedActions = actions.map((action) => {
      const normalized = this.normalizeAction(action as EditorAction);
      changed = changed || normalized.changed;
      return normalized.action;
    });

    return {
      actions: normalizedActions,
      changed,
    };
  }

  private normalizeAction(action: EditorAction): {
    action: EditorAction;
    changed: boolean;
  } {
    const normalizedAction: EditorAction = { ...(action ?? {}) };
    let changed = false;

    if (normalizedAction.type === 'feedback') {
      const feedbackNormalization = this.normalizeFeedbackAction(normalizedAction);
      changed = changed || feedbackNormalization.changed;
    }

    for (const key of ['then', 'else', 'actions', 'onSuccess', 'onError', 'onOk', 'onCancel']) {
      const nested = normalizedAction[key];
      if (!Array.isArray(nested)) {
        continue;
      }

      const nestedNormalization = this.normalizeActionList(nested);
      if (nestedNormalization.changed) {
        normalizedAction[key] = nestedNormalization.actions;
        changed = true;
      }
    }

    return {
      action: normalizedAction,
      changed,
    };
  }

  private normalizeFeedbackAction(action: EditorAction): {
    changed: boolean;
  } {
    let changed = false;

    if (action.kind === undefined) {
      action.kind = 'message';
      changed = true;
    }

    if (action.content === undefined) {
      const aliasContent = this.firstDefined(action.message, action.text, action.description);
      if (aliasContent !== undefined) {
        action.content = aliasContent;
        changed = true;
      }
    }

    if (action.level === undefined) {
      const aliasLevel = this.firstDefined(
        action.type_,
        action.messageType,
        action.status,
        action.variant,
      );
      if (typeof aliasLevel === 'string' && this.isFeedbackLevel(aliasLevel)) {
        action.level = aliasLevel;
        changed = true;
      }
    }

    for (const aliasKey of [
      'message',
      'text',
      'description',
      'type_',
      'messageType',
      'status',
      'variant',
    ]) {
      if (Object.prototype.hasOwnProperty.call(action, aliasKey)) {
        delete action[aliasKey];
        changed = true;
      }
    }

    return { changed };
  }

  private ensureDistinctStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string' || seen.has(item)) {
        continue;
      }
      seen.add(item);
      normalized.push(item);
    }

    return normalized;
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private normalizeButtonDangerProps(
    componentType: string | undefined,
    props: Record<string, unknown>,
  ): {
    props: Record<string, unknown>;
    changed: boolean;
  } {
    if (componentType !== 'Button' || props.type !== 'danger') {
      return {
        props,
        changed: false,
      };
    }

    const nextProps = { ...props };
    delete nextProps.type;
    nextProps.danger = true;

    return {
      props: nextProps,
      changed: true,
    };
  }

  private appendInsertedComponent(
    schema: A2UISchema | undefined,
    component: Record<string, unknown>,
  ): A2UISchema | undefined {
    if (!schema) {
      return schema;
    }

    const id = typeof component.id === 'string' ? component.id : undefined;
    const type = typeof component.type === 'string' ? component.type : undefined;
    if (!id || !type) {
      return schema;
    }

    return {
      ...schema,
      components: {
        ...schema.components,
        [id]: {
          id,
          type,
          props: this.ensureRecord(component.props),
          childrenIds: this.ensureDistinctStringArray(component.childrenIds),
          events: this.ensureRecord(component.events),
        },
      },
    };
  }

  private mergeUpdatedProps(
    schema: A2UISchema | undefined,
    componentId: string,
    props: Record<string, unknown>,
  ): A2UISchema | undefined {
    if (!schema) {
      return schema;
    }

    const component = schema.components[componentId];
    if (!component) {
      return schema;
    }

    return {
      ...schema,
      components: {
        ...schema.components,
        [componentId]: {
          ...component,
          props: {
            ...(component.props ?? {}),
            ...props,
          },
        },
      },
    };
  }

  private cloneSchema(schema: A2UISchema): A2UISchema {
    return JSON.parse(JSON.stringify(schema)) as A2UISchema;
  }

  private firstDefined(...values: unknown[]): unknown {
    return values.find((value) => value !== undefined);
  }

  private isFeedbackLevel(value: string): value is 'success' | 'error' | 'warning' | 'info' {
    return ['success', 'error', 'warning', 'info'].includes(value);
  }
}
