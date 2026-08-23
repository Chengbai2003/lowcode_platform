/**
 * Agent clarification utils — pure helpers for target resolution display.
 *
 * Extracted from agent-runner.service.ts to keep the runner thin.
 */

import { buildAncestorChain, buildParentMap } from '../schema-context/utils/parent-map.builder';
import type { A2UIComponent, A2UISchema, NodeCandidate } from '../schema-context';
import type { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import type { AgentClarificationCandidate } from './types/agent-edit.types';

const DEFAULT_LABEL_PROPS = [
  'children',
  'title',
  'label',
  'placeholder',
  'message',
  'description',
  'header',
  'tab',
  'name',
  'text',
] as const;
const MAX_LABEL_CHARS = 32;
const MAX_PATH_SEGMENT_CHARS = 18;

export function buildClarificationCandidates(
  candidates: readonly NodeCandidate[],
  schema: A2UISchema,
  componentMetaRegistry: ComponentMetaRegistry,
): AgentClarificationCandidate[] {
  const parentMap = buildParentMap(schema.components);
  return candidates.map((candidate) => {
    const component = schema.components[candidate.id];
    const secondaryLabel = getTypeLabel(candidate.type, componentMetaRegistry);
    const displayLabel =
      extractComponentLabel(component, componentMetaRegistry) ??
      buildFallbackDisplayLabel(candidate, schema, parentMap, secondaryLabel);

    return {
      id: candidate.id,
      type: candidate.type,
      score: candidate.score,
      reason: candidate.reason,
      displayLabel,
      secondaryLabel,
      pathLabel: component
        ? buildCandidatePathLabel(component.id, schema, parentMap, componentMetaRegistry)
        : undefined,
    };
  });
}

export function buildClarificationSummary(candidate: AgentClarificationCandidate): string {
  return candidate.pathLabel
    ? `${candidate.displayLabel}（${candidate.pathLabel}）`
    : candidate.displayLabel;
}

function extractComponentLabel(
  component: A2UIComponent | undefined,
  componentMetaRegistry: ComponentMetaRegistry,
): string | undefined {
  if (!component?.props) return undefined;
  const labelProps = Array.from(
    new Set([...componentMetaRegistry.getTextProps(component.type), ...DEFAULT_LABEL_PROPS]),
  );
  for (const propName of labelProps) {
    const normalized = normalizeDisplayText(component.props[propName], MAX_LABEL_CHARS);
    if (normalized) return normalized;
  }
  return undefined;
}

function buildFallbackDisplayLabel(
  candidate: NodeCandidate,
  schema: A2UISchema,
  parentMap: ReadonlyMap<string, string>,
  secondaryLabel: string,
): string {
  const parentId = parentMap.get(candidate.id);
  if (!parentId) return secondaryLabel;
  const siblingIds = schema.components[parentId]?.childrenIds ?? [];
  const sameTypeSiblings = siblingIds.filter(
    (siblingId) => schema.components[siblingId]?.type === candidate.type,
  );
  const siblingIndex = sameTypeSiblings.indexOf(candidate.id);
  if (sameTypeSiblings.length > 1 && siblingIndex >= 0) {
    return `${secondaryLabel} #${siblingIndex + 1}`;
  }
  return secondaryLabel;
}

function buildCandidatePathLabel(
  componentId: string,
  schema: A2UISchema,
  parentMap: ReadonlyMap<string, string>,
  componentMetaRegistry: ComponentMetaRegistry,
): string | undefined {
  const ancestors = buildAncestorChain(componentId, parentMap, schema.components);
  if (ancestors.length === 0) return undefined;
  const segments = ancestors
    .map((ancestor) => {
      const component = schema.components[ancestor.id];
      return buildPathSegmentLabel(component, ancestor.type, componentMetaRegistry);
    })
    .filter((segment): segment is string => Boolean(segment));
  return segments.length > 0 ? segments.join(' > ') : undefined;
}

function buildPathSegmentLabel(
  component: A2UIComponent | undefined,
  type: string,
  componentMetaRegistry: ComponentMetaRegistry,
): string {
  const label = extractComponentLabel(component, componentMetaRegistry);
  if (label) return normalizeDisplayText(label, MAX_PATH_SEGMENT_CHARS) ?? label;
  return getTypeLabel(type, componentMetaRegistry);
}

function getTypeLabel(type: string, componentMetaRegistry: ComponentMetaRegistry): string {
  return componentMetaRegistry.getDisplayName(type) ?? type;
}

function normalizeDisplayText(value: unknown, maxLength: number): string | undefined {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const normalizedParts = value
      .map((item) => normalizeDisplayText(item, maxLength))
      .filter((item): item is string => Boolean(item));
    if (normalizedParts.length === 0) return undefined;
    return truncateDisplayText(normalizedParts.join(' / '), maxLength);
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return truncateDisplayText(normalized, maxLength);
}

function truncateDisplayText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
