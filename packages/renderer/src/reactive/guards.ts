/**
 * Reactive guards — single source for prototype-pollution checks.
 *
 * Path helpers already enforce isSafeKey, but call sites in
 * ReactiveRuntime.set() and future DataPath validators should
 * import from here to keep the denylist canonical.
 *
 * @module renderer/reactive/guards
 */

import { isSafeKey, parsePath } from './path';
import type { DataPath } from './types';

export { isSafeKey };

/**
 * Assert that a full DataPath (namespace + rest) contains no polluting segments.
 * Throws on violation to fail-closed, matching pipeline's GeneratedIdentifierRegistry semantics.
 */
export function assertSafePath(path: DataPath): void {
  const { namespace, rest } = parsePath(path);
  if (!isSafeKey(namespace)) throw new Error(`[ReactiveRuntime] Invalid namespace: ${namespace}`);
  for (const part of rest.split('.')) {
    if (!isSafeKey(part)) throw new Error(`[ReactiveRuntime] Invalid key: ${part}`);
  }
}

/**
 * Returns true if the entire path is safe (no throw).
 */
export function isSafePath(path: DataPath): boolean {
  try {
    assertSafePath(path);
    return true;
  } catch {
    return false;
  }
}
