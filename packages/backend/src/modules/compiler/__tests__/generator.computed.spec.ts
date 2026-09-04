import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { compileToCode } from '../generator';

const conformanceFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
    'utf8',
  ),
) as {
  schema: PageSchema;
  edgeSchema: PageSchema;
  expected: {
    initial: { state: Record<string, unknown>; computed: Record<string, unknown> };
    afterChange: { state: Record<string, unknown>; computed: Record<string, unknown> };
  };
  edgeExpected: {
    undefinedKeys: string[];
    values: Record<string, unknown>;
    arraysWithUndefinedItem: string[];
    view: unknown[];
  };
};

function extractGeneratedComponentBody(code: string): string {
  const functionStart = 'export default function GeneratedPage() {\n';
  const start = code.indexOf(functionStart);
  const end = code.lastIndexOf('\n  return ');
  if (start < 0 || end < 0) throw new Error('GeneratedPage body not found');
  return code
    .slice(start + functionStart.length, end)
    .replace(/^  /gm, '')
    .trim();
}

function createHookHarness(code: string, returnedCode: string) {
  let renderedState: unknown;
  const useState = (initialState: unknown) => {
    renderedState = initialState;
    return [
      initialState,
      (update: unknown) => {
        renderedState =
          typeof update === 'function'
            ? (update as (state: unknown) => unknown)(renderedState)
            : update;
      },
    ];
  };
  const useMemo = (factory: () => unknown) => factory();
  const useRef = <T>(value: T) => ({ current: value });
  const useEffect = (effect: () => void | (() => void)) => {
    effect();
  };
  const factory = new Function(
    'useState',
    'useMemo',
    'useRef',
    'useEffect',
    `${extractGeneratedComponentBody(code)}\nreturn ${returnedCode};`,
  );
  return {
    value: factory(useState, useMemo, useRef, useEffect),
    getRenderedState: () => renderedState,
  };
}

describe('compiler named Computed generation', () => {
  it('matches the shared conformance corpus before and after one event', () => {
    const code = compileToCode(conformanceFixture.schema);
    const harness = createHookHarness(
      code,
      `{
      handle: handleChangePriceClick,
      read: () => ({ state: stateRef.current, computed: computedRef.current })
    }`,
    );
    const generated = harness.value as {
      handle: () => void;
      read: () => { state: Record<string, unknown>; computed: Record<string, unknown> };
    };

    expect(generated.read()).toEqual(conformanceFixture.expected.initial);
    generated.handle();
    expect(generated.read()).toEqual(conformanceFixture.expected.afterChange);
  });

  it('matches shared fail-close and deep-freeze result semantics', () => {
    const code = compileToCode(conformanceFixture.edgeSchema);
    const harness = createHookHarness(
      code,
      `{
      state: stateRef.current,
      computed: computedRef.current
    }`,
    );
    const result = harness.value as {
      state: Record<string, unknown>;
      computed: Record<string, unknown>;
    };

    for (const key of conformanceFixture.edgeExpected.undefinedKeys) {
      expect(result.computed[key]).toBeUndefined();
    }
    for (const [key, value] of Object.entries(conformanceFixture.edgeExpected.values)) {
      expect(result.computed[key]).toEqual(value);
    }
    for (const key of conformanceFixture.edgeExpected.arraysWithUndefinedItem) {
      expect(result.computed[key]).toHaveLength(1);
      expect((result.computed[key] as unknown[])[0]).toBeUndefined();
    }
    expect(result.computed.view).toEqual(conformanceFixture.edgeExpected.view);
    expect(result.computed.view).not.toBe(result.state.profile);
    expect(Object.isFrozen(result.computed.view)).toBe(true);
    expect(Object.isFrozen((result.computed.view as unknown[])[0])).toBe(true);
  });

  it('sanitizes runtime values before pure-function coercion', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { value: 1 },
        computed: { number: 'Number(state.value)' },
      },
      components: { root: { id: 'root', type: 'Page' } },
    });
    const harness = createHookHarness(code, 'computePageLogic');
    const compute = harness.value as (state: Record<string, unknown>) => Record<string, unknown>;
    let coercionCalled = false;

    const computed = compute({
      value: {
        valueOf() {
          coercionCalled = true;
          return 7;
        },
      },
    });

    expect(computed.number).toBeUndefined();
    expect(coercionCalled).toBe(false);
  });

  it('uses a strict JSON-like input boundary for non-JSON runtime values', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { value: null },
        computed: {
          asString: 'String(state.value)',
          truthy: 'Boolean(state.value)',
          less: 'state.value < 1',
        },
      },
      components: { root: { id: 'root', type: 'Page' } },
    });
    const harness = createHookHarness(code, 'computePageLogic');
    const compute = harness.value as (state: Record<string, unknown>) => Record<string, unknown>;

    expect(compute({ value: new Date(0) })).toEqual({
      asString: 'undefined',
      truthy: false,
      less: false,
    });
  });

  it('uses Contract topology and exposes Computed to JSX', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { price: 2, quantity: 3 },
        computed: {
          label: 'String(computed.total)',
          total: 'state.price * state.quantity',
        },
      },
      components: {
        root: { id: 'root', type: 'Text', props: { children: '{{ computed.label }}' } },
      },
    });

    expect(code).toContain('import React, { useMemo, useRef, useState } from "react";');
    expect(code).toContain('const computed = useMemo(() => computePageLogic(state)');
    expect(code).toContain('{computed.label}');
    expect(code.indexOf('computed["total"]')).toBeLessThan(code.indexOf('computed["label"]'));
  });

  it('keeps State and Computed current across consecutive actions in one handler', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'button',
      logic: {
        states: { count: 1, seen: 0 },
        computed: { double: 'state.count * 2' },
      },
      components: {
        button: {
          id: 'button',
          type: 'Button',
          events: {
            onClick: [
              { type: 'setValue', field: 'state.count', value: '{{ state.count + 1 }}' },
              { type: 'setValue', field: 'state.seen', value: '{{ computed.double }}' },
            ],
          },
        },
      },
    });
    const harness = createHookHarness(
      code,
      `{
      handle: handleButtonClick,
      read: () => ({ state: stateRef.current, computed: computedRef.current })
    }`,
    );
    const generated = harness.value as {
      handle: () => void;
      read: () => { state: Record<string, unknown>; computed: Record<string, unknown> };
    };

    generated.handle();

    expect(generated.read()).toEqual({
      state: { count: 2, seen: 4 },
      computed: { double: 4 },
    });
    expect(harness.getRenderedState()).toEqual({ count: 2, seen: 4 });
  });

  it('refreshes refs after await before reading Computed', async () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { count: 1, seen: 0 },
        computed: { double: 'state.count * 2' },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['slow', 'fast'] },
        slow: {
          id: 'slow',
          type: 'Button',
          events: {
            onClick: [
              { type: 'delay', ms: 0 },
              { type: 'setValue', field: 'state.seen', value: '{{ computed.double }}' },
            ],
          },
        },
        fast: {
          id: 'fast',
          type: 'Button',
          events: {
            onClick: [{ type: 'setValue', field: 'state.count', value: '{{ state.count + 1 }}' }],
          },
        },
      },
    });
    const harness = createHookHarness(
      code,
      `{
      slow: handleSlowClick,
      fast: handleFastClick,
      read: () => stateRef.current
    }`,
    );
    const generated = harness.value as {
      slow: () => Promise<void>;
      fast: () => void;
      read: () => Record<string, unknown>;
    };

    const slow = generated.slow();
    generated.fast();
    await slow;

    expect(generated.read()).toEqual({ count: 2, seen: 4 });
  });

  it('fails closed before emitting invalid or writable Computed', () => {
    const base = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page' } },
    };

    expect(() =>
      compileToCode({
        ...base,
        logic: { states: { count: 1 }, computed: { bad: 'window.location' } },
      }),
    ).toThrow(/namespace "window" is not allowed/);
    expect(() =>
      compileToCode({
        ...base,
        logic: { states: { count: 1 }, computed: { total: 'state.count' } },
        components: {
          root: {
            id: 'root',
            type: 'Page',
            events: {
              onClick: [{ type: 'setValue', field: 'computed.total', value: 2 }],
            },
          },
        },
      }),
    ).toThrow(/Computed target "computed.total" is read-only/);
  });

  it('rejects user fields that shadow the Computed binding', () => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { computed: { constant: '1' } },
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['input'] },
          input: { id: 'input', type: 'Input', props: { field: 'computed' } },
        },
      }),
    ).toThrow(/page-computed/);
  });

  it('rejects user fields that shadow Computed runtime intrinsics', () => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { computed: { constant: '1' } },
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['input'] },
          input: { id: 'input', type: 'Input', props: { field: 'Array' } },
        },
      }),
    ).toThrow(/page-computed-intrinsic/);
  });

  it('rejects component imports that shadow Computed runtime intrinsics', () => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { computed: { constant: '1' } },
        components: {
          root: { id: 'root', type: 'Array' },
        },
      }),
    ).toThrow(/reserved Computed runtime intrinsic/);
  });
});
