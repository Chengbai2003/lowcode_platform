import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeComputedDeclarations,
  validatePageSchemaValue,
  type PageLogic,
  type PageSchema,
} from '../index';

const conformanceFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-computed-conformance.json'),
    'utf8',
  ),
) as {
  schema: PageSchema;
  expected: { topology: string[] };
};

function issueCodes(logic: PageLogic, limits?: Parameters<typeof analyzeComputedDeclarations>[1]) {
  const result = analyzeComputedDeclarations(logic, limits);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

function schemaWith(logic: unknown, actions: readonly unknown[] = []) {
  return {
    schemaVersion: 0,
    rootId: 'root',
    logic,
    components: {
      root: {
        id: 'root',
        type: 'Page',
        events: actions.length > 0 ? { onClick: actions } : undefined,
      },
    },
  };
}

describe('Computed Contract analysis', () => {
  it('accepts the shared conformance corpus and emits its stable topology', () => {
    const canonical = validatePageSchemaValue(conformanceFixture.schema);

    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    const analysis = analyzeComputedDeclarations(canonical.value.logic);
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.value.nodes.map((node) => node.key)).toEqual(
        conformanceFixture.expected.topology,
      );
    }
  });

  it('produces stable dependency-first topology and frozen metadata', () => {
    const first = analyzeComputedDeclarations({
      states: { price: 2, quantity: 3 },
      computed: {
        label: 'String(computed.total)',
        total: 'state.price * state.quantity',
      },
    });
    const second = analyzeComputedDeclarations({
      states: { quantity: 3, price: 2 },
      computed: {
        total: 'state.price * state.quantity',
        label: 'String(computed.total)',
      },
    });

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.nodes).toEqual([
      {
        key: 'total',
        expression: 'state.price * state.quantity',
        stateDependencies: ['price', 'quantity'],
        computedDependencies: [],
      },
      {
        key: 'label',
        expression: 'String(computed.total)',
        stateDependencies: [],
        computedDependencies: ['total'],
      },
    ]);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.nodes)).toBe(true);
    expect(Object.isFrozen(first.value.nodes[0].stateDependencies)).toBe(true);
  });

  it('uses unambiguous top-level State dependencies for static nested access', () => {
    const result = analyzeComputedDeclarations({
      states: { profile: { 'a.b': 1 }, items: [2] },
      computed: { value: 'state.profile["a.b"] + state.items[0]' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes[0].stateDependencies).toEqual(['items', 'profile']);
    }
  });

  it.each([
    ['mustache wrapper', '{{ state.count }}', 'COMPUTED_MUSTACHE_FORBIDDEN'],
    ['host namespace', 'window.location', 'COMPUTED_NAMESPACE_FORBIDDEN'],
    ['bare host identifier', 'document', 'COMPUTED_IDENTIFIER_FORBIDDEN'],
    ['network call', 'fetch(state.url)', 'COMPUTED_CALL_FORBIDDEN'],
    ['constructor', 'new Date()', 'COMPUTED_CONSTRUCTOR_FORBIDDEN'],
    ['dynamic member', 'state[key]', 'COMPUTED_DYNAMIC_ACCESS_FORBIDDEN'],
    ['dangerous member', 'state.constructor', 'COMPUTED_MEMBER_FORBIDDEN'],
    ['multiple expressions', 'state.count, 1', 'COMPUTED_SINGLE_EXPRESSION_REQUIRED'],
  ])('rejects %s', (_label, expression, expectedCode) => {
    expect(
      issueCodes({
        states: { count: 1, url: 'https://example.test' },
        computed: { value: expression },
      }),
    ).toContain(expectedCode);
  });

  it('rejects missing State and Computed references', () => {
    expect(issueCodes({ computed: { value: 'state.missing' } })).toContain(
      'COMPUTED_REFERENCE_MISSING',
    );
    expect(issueCodes({ computed: { value: 'computed.missing' } })).toContain(
      'COMPUTED_REFERENCE_MISSING',
    );
  });

  it('rejects self and cross-node cycles', () => {
    expect(issueCodes({ computed: { value: 'computed.value' } })).toContain('COMPUTED_CYCLE');
    expect(
      issueCodes({ computed: { first: 'computed.second', second: 'computed.first' } }),
    ).toContain('COMPUTED_CYCLE');
  });

  it.each([
    [
      'entry count',
      { states: { a: 1 }, computed: { first: 'state.a', second: 'state.a' } },
      { maxComputedEntries: 1 },
      'COMPUTED_ENTRIES_BUDGET_EXCEEDED',
    ],
    [
      'expression length',
      { states: { count: 1 }, computed: { value: 'state.count' } },
      { maxComputedExpressionLength: 5 },
      'COMPUTED_EXPRESSION_TOO_LONG',
    ],
    [
      'AST depth',
      { states: { count: 1 }, computed: { value: '!!!state.count' } },
      { maxComputedAstDepth: 2 },
      'COMPUTED_AST_DEPTH_EXCEEDED',
    ],
    [
      'total AST nodes',
      { states: { count: 1 }, computed: { first: 'state.count', second: 'state.count' } },
      { maxComputedAstNodes: 5 },
      'COMPUTED_AST_TOTAL_BUDGET_EXCEEDED',
    ],
    [
      'dependency edges',
      { states: { first: 1, second: 2 }, computed: { value: 'state.first + state.second' } },
      { maxComputedDependencies: 1 },
      'COMPUTED_GRAPH_BUDGET_EXCEEDED',
    ],
  ])('enforces the %s budget', (_label, logic, limits, expectedCode) => {
    expect(issueCodes(logic, limits)).toContain(expectedCode);
  });

  it('canonicalizes non-enumerable declarations, trims expressions, and deep-freezes them', () => {
    const computed = Object.create(null) as Record<string, string>;
    Object.defineProperty(computed, 'total', {
      value: '  state.count + 1  ',
      enumerable: false,
      configurable: true,
    });
    const result = validatePageSchemaValue(schemaWith({ states: { count: 1 }, computed }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.logic?.computed).toEqual({ total: 'state.count + 1' });
    expect(Object.keys(result.value.logic?.computed ?? {})).toEqual(['total']);
    expect(Object.isFrozen(result.value.logic?.computed)).toBe(true);
  });

  it('rejects a Computed accessor without executing it', () => {
    let called = false;
    const computed = {
      get value() {
        called = true;
        return 'state.count';
      },
    };

    const result = validatePageSchemaValue(schemaWith({ states: { count: 1 }, computed }));

    expect(result.ok).toBe(false);
    expect(called).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('ACCESSOR_PROPERTY_FORBIDDEN');
    }
  });

  it('rejects a direct analyzer accessor without executing it', () => {
    let called = false;
    const logic = Object.create(null) as PageLogic;
    Object.defineProperty(logic, 'computed', {
      get() {
        called = true;
        return { value: '1' };
      },
    });

    const result = analyzeComputedDeclarations(logic);

    expect(result.ok).toBe(false);
    expect(called).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'COMPUTED_ANALYSIS_INPUT_INVALID' }),
      );
    }
  });

  it('counts Computed declarations against the shared JSON node budget', () => {
    const result = validatePageSchemaValue(schemaWith({ computed: { first: '1', second: '2' } }), {
      maxJsonNodes: 2,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('SCHEMA_BUDGET_EXCEEDED');
    }
  });

  it.each([
    { type: 'setValue', field: 'computed.total', value: 1 },
    { type: 'apiCall', url: 'https://example.test', resultTo: 'computed.total' },
  ])('rejects Action writes to the read-only Computed namespace', (action) => {
    const result = validatePageSchemaValue(
      schemaWith({ states: { count: 1 }, computed: { total: 'state.count + 1' } }, [action]),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'COMPUTED_TARGET_READONLY' }),
      );
    }
  });

  it('keeps an exact legacy data target named computed writable', () => {
    const result = validatePageSchemaValue(
      schemaWith({ states: { count: 1 }, computed: { total: 'state.count + 1' } }, [
        { type: 'setValue', field: 'computed', value: 'legacy' },
      ]),
    );

    expect(result.ok).toBe(true);
  });
});
