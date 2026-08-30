import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { renderFromJSON, Renderer } from '../index';

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
    const element = renderFromJSON(raw);
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

    expect(() => renderToString(React.createElement(Renderer, { schema: raw as never }))).toThrow();
    expect(getterRan).toBe(false);
  });

  it('Renderer component rejects invalid schema props (fail-close)', () => {
    const bad: unknown = { ...validSchema, rootId: '' };
    expect(() => renderToString(React.createElement(Renderer, { schema: bad as never }))).toThrow();
  });
});
