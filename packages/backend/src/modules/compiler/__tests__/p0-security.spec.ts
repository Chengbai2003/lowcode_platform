import { compileSchemaToCode } from '../pipeline';

function compileToCode(s: any) {
  return compileSchemaToCode(s);
}

function makeSchema(overrides: any) {
  return {
    version: 1,
    rootId: 'page_root',
    components: overrides,
  } as any;
}

describe('P0 compiler security', () => {
  it('sanitizes fetch injection in expression — final code not contains fetch(', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['t1'] },
      t1: {
        id: 't1',
        type: 'Text',
        props: { children: '{{ fetch("https://evil.com") }}' },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).not.toContain('fetch(');
  });

  it('sanitizes javascript: navigate — literal falls back to /', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'go' },
        events: { onClick: [{ type: 'navigate', to: 'javascript:alert(1)' }] },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).not.toContain('javascript:');
    expect(code).toContain(`window.location.href = "/"`);
  });

  it('sanitizes constructor bypass — final code not contains constructor', () => {
    const cases = [
      `{{ data.constructor.constructor("alert(1)")() }}`,
      `{{ ({}).constructor }}`,
      `{{ data["constructor"] }}`,
      `{{ fetch("https://evil") }}`,
      `{{ Math["max"](1,2) }}`,
      `{{ data.foo() }}`,
      `{{ JSON.stringify(data) }}`,
    ];
    for (const expr of cases) {
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['t1'] },
        t1: { id: 't1', type: 'Text', props: { children: expr }, childrenIds: [] },
      });
      const code = compileToCode(schema);
      // all should be sanitized: no constructor/fetch/JSON in final code
      expect(code).not.toContain('fetch(');
      expect(code).not.toContain('constructor');
      expect(code).not.toContain('JSON.');
    }
  });

  it('allows whitelisted calls', () => {
    // direct sanity: Math.max allowed, String allowed, Date.now allowed; fetch blocked
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['t1'] },
      t1: {
        id: 't1',
        type: 'Text',
        props: { children: '{{ Math.max(1, 2) }}' },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).toContain('Math.max');
  });

  it('downgrades dynamic navigate to / (P0 conservative)', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'go' },
        events: { onClick: [{ type: 'navigate', to: '{{ someVar }}' }] },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).toContain(`window.location.href = '/'`);
    expect(code).not.toContain('someVar');
  });

  // P0: arguments + BLOCKED_CALLEE_NAMES 16 = 17 禁止生成标识符，fail-close 保留原名抛错（防 __proto__ 洗白）
  describe.each([
    'eval',
    'arguments',
    '__proto__',
    'prototype',
    'constructor',
    'toJSON',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'assign',
    'defineProperty',
    'setPrototypeOf',
    'freeze',
    'seal',
    'preventExtensions',
    'Function',
  ])('blocked generated identifier: %s', (name) => {
    it('rejects the field during compilation', () => {
      // 避免 __proto__ 字面量原型语义，用值形式构造 field
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['f1'] },
        f1: {
          id: 'f1',
          type: 'Input',
          props: { field: name },
          childrenIds: [],
        },
      });
      let thrown: unknown;
      try {
        compileToCode(schema);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(`标识符 "${name}"`);
      expect((thrown as Error).message).toContain(`reserved:${name}`);
    });
  });

  it('allows normal fields and keeps builtin calls allowed', () => {
    for (const name of ['username', 'orderTotal']) {
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['f1'] },
        f1: { id: 'f1', type: 'Input', props: { field: name }, childrenIds: [] },
      });
      expect(() => compileToCode(schema)).not.toThrow();
      const code = compileToCode(schema);
      expect(code).toContain(name);
    }
    // String(1) / Math.max 仍可编译（白名单）
    const schema2 = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['t1'] },
      t1: { id: 't1', type: 'Text', props: { children: '{{ String(1) }}' }, childrenIds: [] },
    });
    expect(compileToCode(schema2)).toContain('String(');
    const schema3 = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['t1'] },
      t1: { id: 't1', type: 'Text', props: { children: '{{ Math.max(1,2) }}' }, childrenIds: [] },
    });
    expect(compileToCode(schema3)).toContain('Math.max');
  });

  it('keeps handler internal suffix allocation separate from user field fail-close', () => {
    // 同一页面两个按钮事件同名应自动后缀，不抛错
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['b1', 'b2'] },
      b1: {
        id: 'b1',
        type: 'Button',
        props: { children: 'a' },
        events: { onClick: [{ type: 'log', value: 'hi' }] },
        childrenIds: [],
      },
      b2: {
        id: 'b2',
        type: 'Button',
        props: { children: 'b' },
        events: { onClick: [{ type: 'log', value: 'hi2' }] },
        childrenIds: [],
      },
    });
    expect(() => compileToCode(schema)).not.toThrow();
  });
});
