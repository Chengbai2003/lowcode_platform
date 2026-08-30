/**
 * Schema sync helpers — pure functions for snapshot handling.
 *
 * Extracted from LowcodeEditor.tsx to keep the editor facade thin.
 *
 * 语义变更（Issue #16 / M0-1）：Schema 不再携带页面修订版本，
 * 页面版本仅存在于编辑器独立状态（pageVersion）与 API envelope 中，
 * 因此 resolveSchemaVersion / schemaVersionRef 已删除。
 */

import type { ComponentNode, PageSchema, AIMessageActionResult } from '../../types';

export function isA2UISchema(value: unknown): value is PageSchema {
  if (!value || typeof value !== 'object') return false;
  return 'rootId' in value && 'components' in value;
}

export function extractSchemaSnapshot(value: unknown): PageSchema | null {
  if (isA2UISchema(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const actionResult = value as Partial<AIMessageActionResult>;
  if (isA2UISchema(actionResult.schemaSnapshot)) return actionResult.schemaSnapshot;
  const maybeProps = (actionResult as { props?: unknown }).props;
  if (isA2UISchema(maybeProps)) return maybeProps;
  return null;
}

export function buildSubtreeSchema(source: PageSchema, rootId: string): PageSchema | null {
  const root = source.components[rootId];
  if (!root) return null;
  const components: Record<string, ComponentNode> = {};
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (components[id]) continue;
    const node = source.components[id];
    if (!node) continue;
    components[id] = node;
    if (Array.isArray(node.childrenIds)) {
      for (const childId of node.childrenIds) {
        if (typeof childId === 'string' && source.components[childId]) stack.push(childId);
      }
    }
  }
  return { schemaVersion: source.schemaVersion, rootId, components };
}

export function applyComponentSnapshot(
  baseSchema: PageSchema,
  snapshot: PageSchema,
  componentId: string,
): PageSchema | null {
  if (!baseSchema.components[componentId]) return null;
  const subtree =
    snapshot.rootId === componentId ? snapshot : buildSubtreeSchema(snapshot, componentId);
  if (!subtree || !subtree.components[subtree.rootId]) return null;

  const toRemove = new Set<string>();
  const stack = [componentId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (toRemove.has(id)) continue;
    toRemove.add(id);
    const node = baseSchema.components[id];
    if (!node?.childrenIds) continue;
    for (const childId of node.childrenIds) {
      if (typeof childId === 'string' && baseSchema.components[childId]) stack.push(childId);
    }
  }

  const nextComponents = { ...baseSchema.components };
  for (const id of toRemove) delete nextComponents[id];
  for (const [id, comp] of Object.entries(subtree.components)) nextComponents[id] = comp;

  return { ...baseSchema, components: nextComponents };
}
