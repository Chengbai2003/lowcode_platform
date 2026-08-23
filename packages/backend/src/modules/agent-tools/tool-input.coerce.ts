/**
 * Tool input coercion helpers — single place for as* and schema creation.
 *
 * Extracted from tool-registry.service.ts to keep the registry as thin facade.
 */

import { EditorAction, EditorActionList } from './types/editor-action.types';
import { EditorPatchOperation } from './types/editor-patch.types';
import { ToolInputSchema } from './types/tool.types';

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function asRequiredString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function asRequiredNumber(value: unknown): number {
  return typeof value === 'number' ? value : -1;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function asActionList(value: unknown): EditorActionList {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map(
      (item) =>
        ({
          ...item,
          type: typeof item.type === 'string' ? item.type : '',
        }) as EditorAction,
    );
}

export function asPatchArray(value: unknown): EditorPatchOperation[] {
  return Array.isArray(value) ? (value as EditorPatchOperation[]) : [];
}

export function createObjectSchema(
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): ToolInputSchema {
  return {
    type: 'object',
    description,
    properties,
    required,
    additionalProperties: false,
  };
}
