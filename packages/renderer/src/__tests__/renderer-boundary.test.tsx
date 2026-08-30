import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { renderFromJSON, Renderer } from '../index';
import { testPreset } from './fixtures/testPreset';

const validSchema = {
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: [] },
  },
};

describe('Renderer contract boundary (fail-close)', () => {
  it('renderFromJSON returns an element carrying the canonical frozen schema', () => {
    const raw = JSON.stringify(validSchema);
    const element = renderFromJSON(raw, undefined, { preset: testPreset });
    expect(React.isValidElement(element)).toBe(true);
    // 只渲染 Contract 返回的 canonical 深冻结对象，而非原始输入
    expect(element.props.schema).not.toBe(JSON.parse(raw));
    expect(Object.isFrozen(element.props.schema)).toBe(true);
    expect(Object.isFrozen(element.props.schema.components.root)).toBe(true);
  });

  it('renderFromJSON rejects unsupported schemaVersion', () => {
    const bad = JSON.stringify({ ...validSchema, schemaVersion: 999 });
    expect(() => renderFromJSON(bad)).toThrow(/schemaVersion/i);
  });

  it('renderFromJSON rejects malformed schema', () => {
    expect(() => renderFromJSON(JSON.stringify({ components: {} }))).toThrow();
    expect(() => renderFromJSON('not json')).toThrow();
  });

  it('Renderer rejects getter-carrying schema without executing it', () => {
    let getterRan = false;
    const raw: Record<string, unknown> = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
    };
    Object.defineProperty(raw, 'injected', {
      get() {
        getterRan = true;
        return 'x';
      },
      enumerable: true,
      configurable: true,
    });

    expect(() =>
      renderToString(React.createElement(Renderer, { schema: raw as never, preset: testPreset })),
    ).toThrow();
    expect(getterRan).toBe(false);
  });

  it('Renderer component rejects invalid schema props (fail-close)', () => {
    const bad: unknown = { ...validSchema, rootId: '' };
    expect(() =>
      renderToString(React.createElement(Renderer, { schema: bad as never, preset: testPreset })),
    ).toThrow();
  });
});

describe('Renderer same-reference mutation rerender (fail-safe)', () => {
  it('in-place mutation of a rendered schema object does not leak into the tree', async () => {
    const { render } = await import('@testing-library/react');
    const mutable: Record<string, unknown> = JSON.parse(JSON.stringify(validSchema));

    const { container, rerender } = render(
      React.createElement(Renderer, { schema: mutable as never, preset: testPreset }),
    );
    const before = container.innerHTML;

    // 同引用原地变异：schemaVersion 改为非法值并注入垃圾字段
    mutable.schemaVersion = 999;
    mutable.components = {
      ...(mutable.components as Record<string, unknown>),
      injected: { id: 'injected', type: 'Injected' },
    };

    // 同一对象引用 rerender：useMemo 依引用记忆，渲染树必须仍消费首帧的 canonical 快照
    expect(() =>
      rerender(React.createElement(Renderer, { schema: mutable as never, preset: testPreset })),
    ).not.toThrow();
    expect(container.innerHTML).toBe(before);
    expect(container.textContent).not.toContain('Injected');
  });
});

describe('AutoFix descriptor-safe clone (fail-close)', () => {
  it('validateAndAutoFixA2UISchema rejects getter-carrying input without executing it', async () => {
    const { validateAndAutoFixA2UISchema } = await import('../schemaValidation');
    let getterRan = 0;
    const raw: Record<string, unknown> = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
    };
    Object.defineProperty(raw, 'injected', {
      get() {
        getterRan += 1;
        return { poison: true };
      },
      enumerable: true,
      configurable: true,
    });

    const result = await validateAndAutoFixA2UISchema(raw, []);
    expect(result.success).toBe(false);
    expect(getterRan).toBe(0);
    if (!result.success) {
      expect(result.error.issues.some((i) => /访问器|getter/i.test(i.message))).toBe(true);
    }
  });
});
