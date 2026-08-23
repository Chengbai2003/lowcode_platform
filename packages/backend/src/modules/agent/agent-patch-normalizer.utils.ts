/**
 * Patch normalizer — pure dedup and no-op filtering for final patch.
 *
 * Extracted from agent-runner.service.ts to keep the runner thin.
 */

import { buildParentMap } from '../schema-context/utils/parent-map.builder';
import type { A2UISchema } from '../schema-context';
import type { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';

export function normalizeFinalPatch(
  baseSchema: A2UISchema,
  patch: readonly EditorPatchOperation[],
): EditorPatchOperation[] {
  const parentMap = buildParentMap(baseSchema.components);
  const deduped: EditorPatchOperation[] = [];
  const seen = new Set<string>();

  for (const operation of patch) {
    const normalized = { ...operation };
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);

    switch (normalized.op) {
      case 'insertComponent': {
        const componentId =
          typeof normalized.component.id === 'string' ? normalized.component.id : undefined;
        if (componentId && baseSchema.components[componentId]) continue;
        break;
      }
      case 'updateProps': {
        const currentProps = baseSchema.components[normalized.componentId]?.props ?? {};
        const hasChange = Object.entries(normalized.props).some(
          ([keyName, value]) => JSON.stringify(currentProps[keyName]) !== JSON.stringify(value),
        );
        if (!hasChange) continue;
        break;
      }
      case 'bindEvent': {
        const currentActions =
          baseSchema.components[normalized.componentId]?.events?.[normalized.event] ?? [];
        if (JSON.stringify(currentActions) === JSON.stringify(normalized.actions)) continue;
        break;
      }
      case 'removeComponent':
        if (!baseSchema.components[normalized.componentId]) continue;
        break;
      case 'moveComponent': {
        const currentParentId = parentMap.get(normalized.componentId);
        const currentIndex =
          currentParentId === undefined
            ? -1
            : (baseSchema.components[currentParentId]?.childrenIds ?? []).indexOf(
                normalized.componentId,
              );
        if (currentParentId === normalized.newParentId && currentIndex === normalized.newIndex)
          continue;
        break;
      }
    }

    deduped.push(normalized);
  }

  return deduped;
}
