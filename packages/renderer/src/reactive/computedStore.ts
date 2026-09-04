import type { ComputedLogicAnalysis } from '@lowcode-platform/schema-contract';
import { safeEvaluate } from '../executor/parser/safeEvaluator';

const COMPUTED_INPUT_SKIP = Symbol('computed-input-skip');

function cloneComputedInput(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown | typeof COMPUTED_INPUT_SKIP {
  if (value === null) return null;
  if (typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint'
      ? COMPUTED_INPUT_SKIP
      : value;
  }
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || descriptor.get || descriptor.set) {
        clone[index] = undefined;
        continue;
      }
      const child = cloneComputedInput(descriptor.value, seen);
      clone[index] = child === COMPUTED_INPUT_SKIP ? undefined : child;
    }
    return clone;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return COMPUTED_INPUT_SKIP;
  const clone: Record<string, unknown> = Object.create(null);
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) continue;
    const child = cloneComputedInput(descriptor.value, seen);
    if (child !== COMPUTED_INPUT_SKIP) clone[key] = child;
  }
  return clone;
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameAnalysis(
  current: ComputedLogicAnalysis | undefined,
  next: ComputedLogicAnalysis | undefined,
): boolean {
  const currentNodes = current?.nodes ?? [];
  const nextNodes = next?.nodes ?? [];
  if (currentNodes.length !== nextNodes.length) return false;
  return currentNodes.every((node, index) => {
    const candidate = nextNodes[index];
    return candidate?.key === node.key && candidate.expression === node.expression;
  });
}

function freezeComputedValue(
  value: unknown,
  active = new WeakSet<object>(),
  frozen = new WeakSet<object>(),
): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value !== 'object') return false;
  if (active.has(value)) return false;
  if (frozen.has(value)) return true;
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
  }

  active.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !('value' in descriptor) ||
      !freezeComputedValue(descriptor.value, active, frozen)
    ) {
      active.delete(value);
      return false;
    }
  }
  active.delete(value);
  Object.freeze(value);
  frozen.add(value);
  return true;
}

function frozenNamespace(values: ReadonlyMap<string, unknown>): Readonly<Record<string, unknown>> {
  const namespace: Record<string, unknown> = Object.create(null);
  for (const [key, value] of values) {
    Object.defineProperty(namespace, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(namespace);
}

/** Session-private cache and invalidation graph for named Computed declarations. */
export class ComputedStore {
  private analysis: ComputedLogicAnalysis | undefined;
  private readonly values = new Map<string, unknown>();
  private readonly dirtyKeys = new Set<string>();
  private stateDependents = new Map<string, readonly string[]>();
  private computedDependents = new Map<string, readonly string[]>();
  private cachedNamespace: Readonly<Record<string, unknown>> = frozenNamespace(this.values);

  configure(next: ComputedLogicAnalysis | undefined): ReadonlySet<string> {
    if (sameAnalysis(this.analysis, next)) return new Set<string>();

    const changedKeys = new Set<string>(this.analysis?.nodes.map((node) => node.key) ?? []);
    for (const node of next?.nodes ?? []) changedKeys.add(node.key);

    this.analysis = next;
    this.values.clear();
    this.dirtyKeys.clear();
    this.stateDependents = this.buildDependents('state', next);
    this.computedDependents = this.buildDependents('computed', next);
    for (const node of next?.nodes ?? []) this.dirtyKeys.add(node.key);
    this.cachedNamespace = frozenNamespace(this.values);
    return changedKeys;
  }

  invalidateStateKey(stateKey: string): ReadonlySet<string> {
    return this.invalidate(this.stateDependents.get(stateKey) ?? []);
  }

  invalidateAll(): ReadonlySet<string> {
    return this.invalidate(this.analysis?.nodes.map((node) => node.key) ?? []);
  }

  read(state: Record<string, unknown>): Readonly<Record<string, unknown>> {
    if (this.dirtyKeys.size === 0) return this.cachedNamespace;

    let computedState: Record<string, unknown> = Object.create(null);
    try {
      const clonedState = cloneComputedInput(state);
      if (clonedState !== COMPUTED_INPUT_SKIP) {
        computedState = clonedState as Record<string, unknown>;
      }
    } catch {
      // Computed 输入严格限制为 descriptor-safe JSON-like 数据；异常时整棵 State fail-close。
    }

    const working = new Map<string, unknown>();
    for (const node of this.analysis?.nodes ?? []) {
      let value: unknown;
      if (this.dirtyKeys.has(node.key) || !this.values.has(node.key)) {
        const computed: Record<string, unknown> = Object.create(null);
        for (const dependency of node.computedDependencies) {
          computed[dependency] = working.get(dependency);
        }
        try {
          const evaluated = safeEvaluate(
            node.expression,
            { state: computedState, computed },
            { rejectImplicitObjectCoercion: true },
          );
          value = freezeComputedValue(evaluated) ? evaluated : undefined;
        } catch {
          value = undefined;
        }
        this.values.set(node.key, value);
      } else {
        value = this.values.get(node.key);
      }
      working.set(node.key, value);
    }

    this.dirtyKeys.clear();
    this.cachedNamespace = frozenNamespace(working);
    return this.cachedNamespace;
  }

  clear(): void {
    this.analysis = undefined;
    this.values.clear();
    this.dirtyKeys.clear();
    this.stateDependents.clear();
    this.computedDependents.clear();
    this.cachedNamespace = frozenNamespace(this.values);
  }

  private buildDependents(
    kind: 'state' | 'computed',
    analysis: ComputedLogicAnalysis | undefined,
  ): Map<string, readonly string[]> {
    const mutable = new Map<string, string[]>();
    for (const node of analysis?.nodes ?? []) {
      const dependencies = kind === 'state' ? node.stateDependencies : node.computedDependencies;
      for (const dependency of dependencies) {
        const dependents = mutable.get(dependency) ?? [];
        dependents.push(node.key);
        mutable.set(dependency, dependents);
      }
    }

    const result = new Map<string, readonly string[]>();
    for (const [dependency, dependents] of mutable) {
      result.set(dependency, Object.freeze(dependents.sort(compareKeys)));
    }
    return result;
  }

  private invalidate(initialKeys: readonly string[]): ReadonlySet<string> {
    const affected = new Set<string>();
    const queue = [...initialKeys].sort(compareKeys);
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index];
      if (affected.has(key)) continue;
      affected.add(key);
      this.dirtyKeys.add(key);
      for (const dependent of this.computedDependents.get(key) ?? []) {
        if (!affected.has(dependent)) queue.push(dependent);
      }
    }
    return affected;
  }
}
