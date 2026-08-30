import { describe, it, expect } from 'vitest';
import {
  analyzeComponentDeps,
  analyzeSchemaDepGraph,
  setsOverlap,
} from '../reactive/dependencyAnalyzer';

describe('analyzeComponentDeps', () => {
  it('extracts data.X dependency from expression', () => {
    const deps = analyzeComponentDeps({
      visible: "{{ data.inputB === 'show' }}",
    });
    expect(deps.dataDeps.has('inputB')).toBe(true);
    expect(deps.hasDynamicDeps).toBe(false);
  });

  it('extracts top-level alias dependency', () => {
    const deps = analyzeComponentDeps({
      value: '{{ inputB }}',
    });
    expect(deps.dataDeps.has('inputB')).toBe(true);
  });

  it('extracts multiple dependencies', () => {
    const deps = analyzeComponentDeps({
      visible: "{{ data.A === 'x' && data.B > 10 }}",
    });
    expect(deps.dataDeps.has('A')).toBe(true);
    expect(deps.dataDeps.has('B')).toBe(true);
  });

  it('returns empty deps for non-expression props', () => {
    const deps = analyzeComponentDeps({
      label: 'Hello',
      count: 42,
      flag: true,
    });
    expect(deps.dataDeps.size).toBe(0);
    expect(deps.hasDynamicDeps).toBe(false);
  });

  it('handles nested props with expressions', () => {
    const deps = analyzeComponentDeps({
      style: {
        color: "{{ data.theme === 'dark' ? 'white' : 'black' }}",
      },
    });
    expect(deps.dataDeps.has('theme')).toBe(true);
  });

  it('handles template strings with multiple expressions', () => {
    const deps = analyzeComponentDeps({
      label: 'Hello {{ data.firstName }} {{ data.lastName }}',
    });
    expect(deps.dataDeps.has('firstName')).toBe(true);
    expect(deps.dataDeps.has('lastName')).toBe(true);
  });

  it('ignores known context keys like formData, state', () => {
    const deps = analyzeComponentDeps({
      value: '{{ formData }}',
    });
    expect(deps.dataDeps.has('formData')).toBe(false);
  });
});

describe('analyzeSchemaDepGraph', () => {
  it('builds dep graph for multiple components', () => {
    const graph = analyzeSchemaDepGraph({
      compA: {
        id: 'compA',
        type: 'Span',
        props: { visible: "{{ data.inputB === 'show' }}" },
      },
      compB: {
        id: 'compB',
        type: 'Input',
        props: { placeholder: 'type' },
      },
    });

    expect(graph.has('compA')).toBe(true);
    expect(graph.get('compA')!.dataDeps.has('inputB')).toBe(true);
    expect(graph.has('compB')).toBe(true);
    expect(graph.get('compB')!.dataDeps.size).toBe(0);
  });
});

describe('setsOverlap', () => {
  it('returns true when sets overlap', () => {
    expect(setsOverlap(new Set(['a', 'b']), new Set(['b', 'c']))).toBe(true);
  });

  it('returns false when sets do not overlap', () => {
    expect(setsOverlap(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(false);
  });

  it('returns false for empty sets', () => {
    expect(setsOverlap(new Set(), new Set(['a']))).toBe(false);
    expect(setsOverlap(new Set(), new Set())).toBe(false);
  });
});
