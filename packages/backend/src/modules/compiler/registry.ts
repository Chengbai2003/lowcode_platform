/**
 * GeneratedIdentifierRegistry — single source for user-field vs internal identifier allocation.
 *
 * Extracted from pipeline.ts to keep the transform pipeline as a thin facade
 * and to make the fail-close vs suffix-allocation boundary explicit.
 *
 * @module compiler/registry
 */

import { isValidIdentifier } from './helpers/codeHelpers';
import { BUILTIN_IDENTIFIERS, RESERVED_GENERATED_IDENTIFIERS } from './security/validators';

export class GeneratedIdentifierRegistry {
  private owners = new Map<string, string>();
  assertAvailable(name: string, owner: string): void {
    const existing = this.owners.get(name);
    if (existing) throw new Error(`标识符 "${name}" (${owner}) 与 ${existing} 冲突`);
  }
  reserveExact(name: string, owner: string): void {
    this.assertAvailable(name, owner);
    this.owners.set(name, owner);
  }
  allocateInternal(base: string, owner: string): string {
    let candidate = base;
    let i = 2;
    while (this.owners.has(candidate)) {
      candidate = `${base}_${i}`;
      i++;
    }
    this.owners.set(candidate, owner);
    return candidate;
  }
  has(name: string): boolean {
    return this.owners.has(name);
  }
}

/**
 * Whether a name is safe to use as a generated JS binding.
 * Mirrors the security invariant: RESERVED ∪ BUILTIN ∪ __-prefix are forbidden.
 */
export function isSafeGeneratedIdentifier(name: string): boolean {
  return (
    isValidIdentifier(name) &&
    !RESERVED_GENERATED_IDENTIFIERS.has(name) &&
    !BUILTIN_IDENTIFIERS.has(name) &&
    !name.startsWith('__')
  );
}

export function isSafeComponentType(name: string): boolean {
  return isSafeGeneratedIdentifier(name) && /^[A-Z][A-Za-z0-9]*$/.test(name);
}
