import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeComputedDeclarations,
  type ComputedLogicAnalysis,
  type PageLogic,
  type PageSchema,
} from '@lowcode-platform/schema-contract';
import { EventDispatcher } from '../../EventDispatcher';
import { createRuntimeSession } from '../../session/RuntimeSession';
import { ReactiveRuntime } from '../runtime';

const conformanceFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-computed-conformance.json'),
    'utf8',
  ),
) as {
  edgeSchema: PageSchema;
  edgeExpected: {
    undefinedKeys: string[];
    values: Record<string, unknown>;
    arraysWithUndefinedItem: string[];
    view: unknown[];
  };
};

function analyze(logic: PageLogic): ComputedLogicAnalysis {
  const result = analyzeComputedDeclarations(logic);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join('; '));
  return result.value;
}

describe('named Computed runtime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('evaluates in shared topology, caches results, and exposes a frozen namespace', () => {
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { price: 2, quantity: 3 } });
    runtime.configureComputed(
      analyze({
        states: { price: 0, quantity: 0 },
        computed: {
          label: 'String(computed.total)',
          total: 'state.price * state.quantity',
        },
      }),
      { notify: false },
    );

    const first = runtime.getComputed();
    const second = runtime.getComputed();

    expect(first).toBe(second);
    expect(first).toEqual({ total: 6, label: '6' });
    expect(Object.isFrozen(first)).toBe(true);
    expect(runtime.get('computed.total')).toBe(6);
    expect(runtime.getSnapshot().computed).toEqual(first);
    expect(Object.isFrozen(runtime.getSnapshot().computed)).toBe(true);
  });

  it('matches shared fail-close and deep-freeze result semantics', () => {
    const runtime = new ReactiveRuntime();
    const logic = conformanceFixture.edgeSchema.logic!;
    runtime.initialize({ state: logic.states as Record<string, unknown> });
    runtime.configureComputed(analyze(logic), { notify: false });

    const computed = runtime.getComputed();
    for (const key of conformanceFixture.edgeExpected.undefinedKeys) {
      expect(computed[key]).toBeUndefined();
    }
    for (const [key, value] of Object.entries(conformanceFixture.edgeExpected.values)) {
      expect(computed[key]).toEqual(value);
    }
    for (const key of conformanceFixture.edgeExpected.arraysWithUndefinedItem) {
      expect(computed[key]).toHaveLength(1);
      expect((computed[key] as unknown[])[0]).toBeUndefined();
    }
    expect(computed.view).toEqual(conformanceFixture.edgeExpected.view);
    expect(computed.view).not.toBe(runtime.getState().profile);
    expect(Object.isFrozen(computed.view)).toBe(true);
    expect(Object.isFrozen((computed.view as unknown[])[0])).toBe(true);
  });

  it('sanitizes runtime values before pure-function coercion', () => {
    let coercionCalled = false;
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { value: 1 } });
    runtime.configureComputed(
      analyze({ states: { value: 1 }, computed: { number: 'Number(state.value)' } }),
      { notify: false },
    );
    runtime.set('state.value', {
      valueOf() {
        coercionCalled = true;
        return 7;
      },
    });

    expect(runtime.get('computed.number')).toBeUndefined();
    expect(coercionCalled).toBe(false);
  });

  it('uses the same strict JSON-like input boundary as generated code', () => {
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { value: null } });
    runtime.configureComputed(
      analyze({
        states: { value: null },
        computed: {
          asString: 'String(state.value)',
          truthy: 'Boolean(state.value)',
          less: 'state.value < 1',
        },
      }),
      { notify: false },
    );

    runtime.set('state.value', new Date(0));

    expect(runtime.getComputed()).toEqual({
      asString: 'undefined',
      truthy: false,
      less: false,
    });
  });

  it('keeps constructor diagnostics stable after evaluator plugins are registered', () => {
    const result = analyzeComputedDeclarations({ computed: { invalid: 'new Date()' } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'COMPUTED_CONSTRUCTOR_FORBIDDEN' }),
      );
    }
  });

  it('invalidates only direct and transitive dependents of the changed State key', () => {
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { first: 1, second: 2, unrelated: 0 } });
    runtime.configureComputed(
      analyze({
        states: { first: 0, second: 0, unrelated: 0 },
        computed: {
          firstView: '[state.first]',
          chained: '[computed.firstView[0] + 1]',
          secondView: '[state.second]',
        },
      }),
      { notify: false },
    );

    const initial = runtime.getComputed();
    runtime.set('state.unrelated', 1);
    const afterUnrelated = runtime.getComputed();
    expect(afterUnrelated).toBe(initial);

    runtime.set('state.first', 4);
    const afterFirst = runtime.getComputed();
    expect(afterFirst.firstView).toEqual([4]);
    expect(afterFirst.chained).toEqual([5]);
    expect(afterFirst.firstView).not.toBe(initial.firstView);
    expect(afterFirst.chained).not.toBe(initial.chained);
    expect(afterFirst.secondView).toBe(initial.secondView);
  });

  it('makes updated Computed visible synchronously while batching React notification once', async () => {
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { count: 1, ignored: 0 } });
    runtime.configureComputed(
      analyze({
        states: { count: 0, ignored: 0 },
        computed: { double: 'state.count * 2' },
      }),
      { notify: false },
    );
    const listener = vi.fn();
    runtime.subscribe(listener);

    runtime.batch(() => {
      runtime.set('state.count', 2);
      expect(runtime.get('computed.double')).toBe(4);
      runtime.set('state.count', 3);
      expect(runtime.get('computed.double')).toBe(6);
      runtime.set('state.ignored', 1);
    });

    expect(listener).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtime.getVersion()).toBe(1);
  });

  it('rejects runtime and host attempts to write Computed', () => {
    const runtime = new ReactiveRuntime();
    const dispatcher = new EventDispatcher({ runtime });

    expect(() => runtime.set('computed.total', 1)).toThrow(/read-only/);
    expect(() => dispatcher.setContext('computed', { total: 1 })).toThrow(/read-only/);
  });

  it('keeps the legacy exact data field named computed unchanged', () => {
    const runtime = new ReactiveRuntime();

    runtime.set('computed', 'legacy');

    expect(runtime.get('computed')).toBe('legacy');
    expect(runtime.get('data.computed')).toBe('legacy');
  });

  it('refreshes State and Computed between actions in one event', async () => {
    vi.useRealTimers();
    const dispatcher = new EventDispatcher({ state: { count: 1 } });
    dispatcher
      .getRuntime()
      .configureComputed(
        analyze({ states: { count: 0 }, computed: { double: 'state.count * 2' } }),
        { notify: false },
      );

    await dispatcher.execute([
      { type: 'setValue', field: 'state.count', value: 2 },
      { type: 'setValue', field: 'result', value: '{{ computed.double }}' },
    ] as never);

    expect(dispatcher.getRuntime().get('result')).toBe(4);
  });

  it('keeps caches session-private and hot-replaces declarations without resetting State', () => {
    const double = analyze({
      states: { count: 0 },
      computed: { result: 'state.count * 2' },
    });
    const triple = analyze({
      states: { count: 0 },
      computed: { next: 'state.count * 3' },
    });
    const first = createRuntimeSession({
      pageId: 'page',
      documentSessionId: 'first',
      dispatcherInit: { state: { count: 1 } },
      computedAnalysis: double,
    });
    const second = createRuntimeSession({
      pageId: 'page',
      documentSessionId: 'second',
      dispatcherInit: { state: { count: 10 } },
      computedAnalysis: double,
    });

    first.runtime.set('state.count', 2);
    expect(first.runtime.get('computed.result')).toBe(4);
    expect(second.runtime.get('computed.result')).toBe(20);

    first.configureComputed(triple);
    expect(first.runtime.get('state.count')).toBe(2);
    expect(first.runtime.get('computed.result')).toBeUndefined();
    expect(first.runtime.get('computed.next')).toBe(6);

    first.dispose();
    expect(first.runtime.getComputed()).toEqual({});
    expect(() => first.configureComputed(double)).toThrow(/disposed/);
    second.dispose();
  });

  it('tracks Computed reads as computed.* dependencies', () => {
    const runtime = new ReactiveRuntime();
    runtime.initialize({ state: { count: 1 } });
    runtime.configureComputed(
      analyze({ states: { count: 0 }, computed: { double: 'state.count * 2' } }),
      { notify: false },
    );

    runtime.startTracking();
    const proxy = runtime.createTrackingProxy();
    expect((proxy.computed as Record<string, unknown>).double).toBe(2);
    expect(runtime.stopTracking()).toContain('computed.double');
  });
});
