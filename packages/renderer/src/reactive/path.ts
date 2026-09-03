/**
 * Reactive path utilities — data path parsing, normalization and safe access.
 *
 * Extracted from runtime.ts to keep ReactiveRuntime as a thin facade
 * and to provide a single place for prototype-pollution guards.
 *
 * @module renderer/reactive/path
 */

import { isSafeDataPathKey } from '@lowcode-platform/schema-contract';
import type { DataPath } from './types';

/**
 * Canonical prototype-pollution guard shared through Schema Contract.
 */
export function isSafeKey(key: string): boolean {
  return isSafeDataPathKey(key);
}

export function parsePath(path: DataPath): { namespace: string; rest: string } {
  const dotIndex = path.indexOf('.');

  if (dotIndex === -1) {
    return { namespace: 'data', rest: path };
  }

  const namespace = path.substring(0, dotIndex);
  const rest = path.substring(dotIndex + 1);

  const validNamespaces = ['data', 'state', 'formData', 'components'];
  if (validNamespaces.includes(namespace)) {
    return { namespace, rest };
  }

  return { namespace: 'data', rest: path };
}

export function normalizePath(path: DataPath): DataPath {
  const { namespace, rest } = parsePath(path);
  return `${namespace}.${rest}`;
}

export function normalizeDeps(deps?: Set<DataPath>): Set<DataPath> | undefined {
  if (!deps) return undefined;
  const normalized = new Set<DataPath>();
  for (const dep of deps) normalized.add(normalizePath(dep));
  return normalized;
}

export function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (!isSafeKey(part)) return undefined;
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  if (!path) return;
  const parts = path.split('.');
  for (const part of parts) {
    if (!isSafeKey(part)) throw new Error(`[ReactiveRuntime] Invalid key: ${part}`);
  }
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (next === null || next === undefined || typeof next !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
