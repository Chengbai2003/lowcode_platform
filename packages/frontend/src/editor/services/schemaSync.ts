/**
 * Schema sync helpers — pure functions for version resolution and snapshot handling.
 *
 * Extracted from LowcodeEditor.tsx to keep the editor facade thin.
 */

import type React from 'react';
import type { A2UIComponent, A2UISchema, AIMessageActionResult } from '../../types';

export function isA2UISchema(value: unknown): value is A2UISchema {
  if (!value || typeof value !== 'object') return false;
  return 'rootId' in value && 'components' in value;
}

export function extractSchemaSnapshot(value: unknown): A2UISchema | null {
  if (isA2UISchema(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const actionResult = value as Partial<AIMessageActionResult>;
  if (isA2UISchema(actionResult.schemaSnapshot)) return actionResult.schemaSnapshot;
  const maybeProps = (actionResult as { props?: unknown }).props;
  if (isA2UISchema(maybeProps)) return maybeProps;
  return null;
}

export function buildSubtreeSchema(source: A2UISchema, rootId: string): A2UISchema | null {
  const root = source.components[rootId];
  if (!root) return null;
  const components: Record<string, A2UIComponent> = {};
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
  return { rootId, components };
}

export function applyComponentSnapshot(
  baseSchema: A2UISchema,
  snapshot: A2UISchema,
  componentId: string,
): A2UISchema | null {
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

/**
 * Resolve version for a schema — mirrors LowcodeEditor.syncSchemaVersion semantics.
 * Keeps version stable if already defined, otherwise falls back to refs.
 */
export function resolveSchemaVersion(
  nextSchema: A2UISchema,
  targetVersion: number | null | undefined,
  pageVersionRef: React.MutableRefObject<number | null>,
  schemaVersionRef: React.MutableRefObject<number | undefined>,
): A2UISchema {
  const resolvedVersion =
    targetVersion ?? pageVersionRef.current ?? schemaVersionRef.current ?? nextSchema.version;
  if (resolvedVersion === undefined) return nextSchema;
  return { ...nextSchema, version: resolvedVersion };
}
