/**
 * Descriptor-safe deep clone utilities
 * Fixes P0-2: getter pollution via `value.getTime()` and `value.constructor`
 * All property access goes through getOwnPropertyDescriptor; Date cloning uses
 * Date.prototype.getTime.call via cached intrinsic descriptor to avoid invoking overrides.
 */

export const SANITIZE_SKIP = Symbol('sanitize-skip');

/**
 * Safe isPlainObject: never reads `value.constructor` or `value.toString`.
 * Only checks prototype via Object.getPrototypeOf.
 * Descriptor-safe: uses getOwnPropertyDescriptor to avoid invoking getter for `constructor`.
 * Also handles `{ __proto__: {} }` pollution shape where proto is a plain object without
 * reading constructor via direct property access.
 */
export function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return true;
  // Handle `{ __proto__: {} }` where proto itself is a plain object (prototype pollution test)
  // Descriptor-safe check without reading `constructor` getter: verify proto's proto is plain
  // and proto does not have own constructor (which would indicate class prototype)
  if (proto !== null && typeof proto === 'object') {
    const protoProto = Object.getPrototypeOf(proto);
    if (protoProto === Object.prototype || protoProto === null) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'constructor');
      if (desc) {
        if (desc.get || desc.set) return false;
        if (typeof desc.value === 'function') return false;
      }
      return true;
    }
  }
  return false;
}

// Cache intrinsic Date getTime descriptor at module load to survive later prototype pollution
const dateGetTimeDesc = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
const intrinsicGetTime: ((this: Date) => number) | null =
  dateGetTimeDesc && 'value' in dateGetTimeDesc && typeof dateGetTimeDesc.value === 'function'
    ? (dateGetTimeDesc.value as (this: Date) => number)
    : null;

/**
 * Safe Date clone: uses intrinsic Date.prototype.getTime via descriptor, never reads `date.getTime`.
 * On failure returns Invalid Date (or throws to allow caller to map to SKIP).
 */
export function cloneDateSafe(value: Date): Date {
  try {
    if (intrinsicGetTime) {
      return new Date(intrinsicGetTime.call(value));
    }
    // Fallback: descriptor-safe read each time (if intrinsic was polluted at load)
    const desc = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
    if (!desc || desc.get || desc.set || typeof desc.value !== 'function') {
      return new Date(NaN);
    }
    return new Date((desc.value as (this: Date) => number).call(value));
  } catch {
    return new Date(NaN);
  }
}

/**
 * Variant for sanitize path: on failure returns SKIP sentinel instead of Invalid Date.
 */
export function cloneDateSafeOrSkip(value: Date, skipSymbol: symbol): Date | symbol {
  try {
    if (intrinsicGetTime) {
      return new Date(intrinsicGetTime.call(value));
    }
    const desc = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
    if (!desc || desc.get || desc.set || typeof desc.value !== 'function') {
      return skipSymbol;
    }
    return new Date((desc.value as (this: Date) => number).call(value));
  } catch {
    return skipSymbol;
  }
}

/**
 * Descriptor-safe sanitize clone: skips non-plain objects, getters, functions, symbols, bigints.
 * Array handling uses getOwnPropertyDescriptor for each index and reads desc.value (never value[i]).
 */
export function cloneSanitizedSafe(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
  skipSymbol: symbol = SANITIZE_SKIP,
  opts: { isTrackingProxy?: (v: unknown) => boolean } = {},
): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      return skipSymbol;
    return value;
  }
  if (opts.isTrackingProxy && opts.isTrackingProxy(value)) return value;
  if (value instanceof Date) {
    const cloned = cloneDateSafeOrSkip(value as Date, skipSymbol);
    return cloned;
  }
  if (seen.has(value as object)) return seen.get(value as object);
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(value as object, arr);
    const len = (value as unknown[]).length;
    for (let i = 0; i < len; i++) {
      const desc = Object.getOwnPropertyDescriptor(value, String(i));
      if (desc && (desc.get || desc.set)) {
        arr[i] = undefined;
        continue;
      }
      const raw = desc ? desc.value : undefined;
      if (typeof raw === 'function' || typeof raw === 'symbol' || typeof raw === 'bigint') {
        arr[i] = undefined;
        continue;
      }
      const cloned = cloneSanitizedSafe(raw, seen, skipSymbol, opts);
      arr[i] = cloned === skipSymbol ? undefined : cloned;
    }
    return arr;
  }
  if (!isPlainObject(value)) return skipSymbol;
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, key);
    if (!desc || desc.get || desc.set) continue;
    const raw = desc.value;
    if (typeof raw === 'function' || typeof raw === 'symbol' || typeof raw === 'bigint') continue;
    const cloned = cloneSanitizedSafe(raw, seen, skipSymbol, opts);
    if (cloned === skipSymbol) continue;
    out[key] = cloned;
  }
  return out;
}

/**
 * Descriptor-safe fallback clone: coerces non-plain objects into plain by copying
 * enumerable own props (descriptor-safe), Date via intrinsic, blocks getters/functions/symbols/bigints.
 * Used by snapshot and pure utils clone.
 */
export function fallbackCloneSafe<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null) return value;
  if (typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      return undefined as unknown as T;
    return value;
  }
  if (value instanceof Date) {
    return cloneDateSafe(value as unknown as Date) as unknown as T;
  }
  if (seen.has(value as object)) return seen.get(value as object) as T;
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(value as object, arr);
    const len = (value as unknown[]).length;
    for (let i = 0; i < len; i++) {
      const desc = Object.getOwnPropertyDescriptor(value, String(i));
      if (desc && (desc.get || desc.set)) {
        arr[i] = undefined;
        continue;
      }
      const raw = desc ? desc.value : undefined;
      if (typeof raw === 'function' || typeof raw === 'symbol' || typeof raw === 'bigint') {
        arr[i] = undefined;
        continue;
      }
      const cloned = fallbackCloneSafe(raw as unknown as T, seen);
      arr[i] = cloned;
    }
    return arr as unknown as T;
  }
  if (!isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    seen.set(value as object, out);
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, k);
      if (!desc || desc.get || desc.set) continue;
      const raw = desc.value;
      if (typeof raw === 'function' || typeof raw === 'symbol' || typeof raw === 'bigint') continue;
      out[k] = fallbackCloneSafe(raw, seen);
    }
    return out as unknown as T;
  }
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, k);
    if (!desc || desc.get || desc.set) continue;
    const raw = desc.value;
    if (typeof raw === 'function' || typeof raw === 'symbol' || typeof raw === 'bigint') continue;
    out[k] = fallbackCloneSafe(raw, seen);
  }
  return out as unknown as T;
}
