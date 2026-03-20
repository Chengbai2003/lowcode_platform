import { Injectable } from '@nestjs/common';
import { EditorPatchOperation } from './types/editor-patch.types';

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
          return {
            ...operation,
            actions: Array.isArray(operation.actions) ? [...operation.actions] : [],
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
}
