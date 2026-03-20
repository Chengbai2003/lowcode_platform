import { Injectable } from '@nestjs/common';
import { EditorPatchOperation } from './types/editor-patch.types';
import { EditorAction } from './types/editor-action.types';

@Injectable()
export class PatchAutoFixService {
  autoFix(patch: readonly EditorPatchOperation[]): {
    patch: EditorPatchOperation[];
    warnings: string[];
  } {
    const warnings: string[] = [];

    const normalizedPatch = patch.map((operation) => {
      switch (operation.op) {
        case 'insertComponent': {
          const component =
            operation.component && typeof operation.component === 'object'
              ? { ...operation.component }
              : {};

          const normalizedComponent = {
            ...component,
            childrenIds: this.ensureDistinctStringArray(component.childrenIds),
            events: this.ensureRecord(component.events),
          };

          const normalizedIndex =
            operation.index === undefined || operation.index < 0 ? undefined : operation.index;
          if (operation.index !== normalizedIndex) {
            warnings.push(`Normalized insert index for component under ${operation.parentId}`);
          }

          return {
            ...operation,
            index: normalizedIndex,
            component: normalizedComponent,
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

  private firstDefined(...values: unknown[]): unknown {
    return values.find((value) => value !== undefined);
  }

  private isFeedbackLevel(value: string): value is 'success' | 'error' | 'warning' | 'info' {
    return ['success', 'error', 'warning', 'info'].includes(value);
  }
}
