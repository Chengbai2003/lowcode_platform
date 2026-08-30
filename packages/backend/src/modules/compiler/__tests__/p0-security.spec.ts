import { execFileSync } from 'node:child_process';
import { compileSchemaToCode, generate, parseSchema, transform } from '../pipeline';
import { CompilerService } from '../compiler.service';
import { CompileRequestDto } from '../dto/compile-request.dto';

jest.mock('../generator', () => ({
  compileToCode: jest.fn(),
  formatCode: jest.fn(),
}));

function compileToCode(s: any) {
  return compileSchemaToCode(s);
}

function makeSchema(overrides: any) {
  return {
    schemaVersion: 0,
    rootId: 'page_root',
    components: overrides,
  } as any;
}

function formatWithPrettier(code: string): string {
  const script = [
    "const prettier = require('prettier');",
    "let source = '';",
    "process.stdin.on('data', (chunk) => { source += chunk; });",
    "process.stdin.on('end', async () => {",
    "  process.stdout.write(await prettier.format(source, { parser: 'babel' }));",
    '});',
  ].join('\n');

  return execFileSync(process.execPath, ['-e', script], { input: code }).toString();
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

  it('rejects malicious cycle identifiers at compile entry', () => {
    const maliciousId = 'x*/}{globalThis.__PWNED__=true}{/*';
    expect(() =>
      compileToCode(
        makeSchema({
          page_root: { id: 'page_root', type: 'Page', childrenIds: [maliciousId] },
          [maliciousId]: { id: maliciousId, type: 'Div', childrenIds: [maliciousId] },
        }),
      ),
    ).toThrow(/component cycle|multiple parents/);
  });

  it('keeps malicious cycle identifiers out of parser-valid generated source', () => {
    const maliciousId = 'x*/}{globalThis.__PWNED__=true}{/*';
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: [maliciousId] },
      [maliciousId]: { id: maliciousId, type: 'Div', childrenIds: [maliciousId] },
    });
    const ast = parseSchema(schema as any);
    transform(ast);
    const code = generate(ast);
    expect(code).not.toContain('*/}{globalThis.__PWNED__=true}{/*');
    expect(code).toContain('Circular reference omitted');
    const formatted = formatWithPrettier(code);
    expect(formatted).not.toContain('__PWNED__');
    expect(formatted).toContain('Circular reference omitted');
  });

  it('rejects invalid component graphs through CompilerService', async () => {
    const dto = new CompileRequestDto();
    dto.schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { type: 'Page', childrenIds: ['missing'] },
      },
    } as any;
    // generator is mocked above; CompilerService delegates validation to compileSchemaToCode,
    // so ensure mocked compileToCode still validates (or bypass mock for this case)
    const { compileToCode: mockedCompile } = require('../generator') as {
      compileToCode: jest.Mock;
    };
    mockedCompile.mockImplementationOnce((s: any) => compileSchemaToCode(s));

    await expect(new CompilerService().compile(dto)).rejects.toThrow(/id is required/);
  });

  it('allows sibling loops to reuse item without renaming or degrading expressions', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'click' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'item',
              over: [{ name: 'a' }],
              actions: [{ type: 'log', value: '{{ item.name }}' }],
            },
            {
              type: 'loop',
              itemVar: 'item',
              over: [{ name: 'b' }],
              actions: [{ type: 'log', value: '{{ item.name }}' }],
            },
          ],
        },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).not.toContain('item_2');
    expect(code).toContain('console.log(item.name)');
    expect(code).toContain('const __loopSource =');
    expect(code).toContain('const __loopSource_2 =');
  });

  it('allows nested loops to shadow item and resolves inner scope correctly without TDZ', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'click' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'item',
              over: [{ list: [{ val: 'inner1' }, { val: 'inner2' }] }],
              actions: [
                {
                  type: 'loop',
                  itemVar: 'item',
                  over: '{{ item.list }}',
                  actions: [{ type: 'log', value: '{{ item.val }}' }],
                },
              ],
            },
          ],
        },
        childrenIds: [],
      },
    });
    const code = compileToCode(schema);
    expect(code).not.toContain('item_2');
    expect(code).toContain('const __loopSource_2 = item.list');
    expect(code).not.toContain('for (const item of item.list)');
    expect(code).toContain('console.log(item.val)');

    // Execute the generated handler body at runtime to verify no TDZ ReferenceError occurs
    const logs: string[] = [];
    const customConsole = { log: (msg: string) => logs.push(msg) };
    const handlerMatch = code.match(/const handleBtnClick = (?:async )?\(\) => {([\s\S]*?)};\n/);
    expect(handlerMatch).toBeTruthy();
    const handlerBody = handlerMatch![1];
    const runHandler = new Function('console', handlerBody);
    expect(() => runHandler(customConsole)).not.toThrow();
    expect(logs).toEqual(['inner1', 'inner2']);
  });

  it('rejects loop when itemVar and indexVar are identical', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'click' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'i',
              indexVar: 'i',
              over: [1, 2, 3],
              actions: [{ type: 'log', value: '{{ i }}' }],
            },
          ],
        },
        childrenIds: [],
      },
    });
    expect(() => compileToCode(schema)).toThrow(/loop indexVar cannot be identical to itemVar/);
  });

  it('rejects unsafe identifier names as loop variables', () => {
    // Contract 层直接拒绝：保留关键字 / __ 前缀 / 非法标识符
    const contractBlockedVars = ['eval', 'arguments', 'constructor', '__proto__', '123bad'];
    for (const badVar of contractBlockedVars) {
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'click' },
          events: {
            onClick: [
              {
                type: 'loop',
                itemVar: badVar,
                over: [1, 2],
                actions: [{ type: 'log', value: 'hi' }],
              },
            ],
          },
          childrenIds: [],
        },
      });
      expect(() => compileToCode(schema)).toThrow(/loop itemVar must be a valid, safe identifier/);
    }

    // Contract 放行但 Compiler 生成层保留字守卫拒绝（如 JS 保留字 class）
    const compilerBlockedVars = ['class'];
    for (const badVar of compilerBlockedVars) {
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'click' },
          events: {
            onClick: [
              {
                type: 'loop',
                itemVar: badVar,
                over: [1, 2],
                actions: [{ type: 'log', value: 'hi' }],
              },
            ],
          },
          childrenIds: [],
        },
      });
      expect(() => compileToCode(schema)).toThrow(/非法循环变量标识符/);
    }
  });
});
