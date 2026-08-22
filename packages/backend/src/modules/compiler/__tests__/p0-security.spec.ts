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
});
