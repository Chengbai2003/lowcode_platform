import { compileToCode, formatCode } from '../generator';
import { parseSchema, transform, generate } from '../pipeline';
import { behaviorSchemas, snapshotSchemas } from './compilerTestSchemas';

async function compileFormatted(schema: unknown) {
  return formatCode(compileToCode(schema as Record<string, any>));
}

function extractGeneratedComponentBody(code: string): string {
  const functionStart = 'export default function GeneratedPage() {\n';
  const start = code.indexOf(functionStart);
  const end = code.lastIndexOf('\n  return ');
  if (start < 0 || end < 0) {
    throw new Error('GeneratedPage body not found');
  }
  return code
    .slice(start + functionStart.length, end)
    .replace(/^  /gm, '')
    .trim();
}

describe('compiler generator behavior', () => {
  it('supports {{ }} expressions and template strings', async () => {
    const code = await compileFormatted(behaviorSchemas.expressionsAndTemplates);

    expect(code).toContain('{"你好，" + name}');
    expect(code).toContain('{`欢迎 ${name}，再次欢迎 ${name}`}');
    expect(code).toContain('href={`/users/${name}`}');
  });

  it('lowers visible props into conditional rendering', async () => {
    const code = await compileFormatted(behaviorSchemas.visibleConditions);

    expect(code).toContain('{enabled ? <Card>条件面板</Card> : null}');
    expect(code).not.toContain('visible={false}');
    expect(code).not.toContain('visible={enabled}');
  });

  it('merges compiled style classes without duplicating className', async () => {
    const code = await compileFormatted(snapshotSchemas.styleClassMerge);

    expect(code).toContain(
      '<Div className="banner-shell mb-[16] flex text-[#1f2937]">系统公告</Div>',
    );
    expect(code).not.toContain('className="banner-shell" className=');
  });

  it('extracts component events and dialog callbacks into named handlers', async () => {
    const code = await compileFormatted(behaviorSchemas.notificationAndDialog);

    expect(code).toContain('const handleBtnUiClick = () => {');
    expect(code).toContain('const handleBtnUiClickOnOk = () => {');
    expect(code).toContain('const handleBtnUiClickOnCancel = () => {');
    expect(code).toContain('onClick={handleBtnUiClick}');
    expect(code).toContain('import { Button, Modal, Page, message, notification } from "antd";');
    expect(code).toContain('notification.success({');
    expect(code).toContain('placement: "bottomRight"');
    expect(code).toContain('Modal.confirm({');
    expect(code).toContain('onOk: handleBtnUiClickOnOk');
    expect(code).toContain('onCancel: handleBtnUiClickOnCancel');
  });

  it('keeps async named handlers for api callbacks when delay is used', async () => {
    const code = await compileFormatted(behaviorSchemas.actionCallbacksAndDelay);

    expect(code).toContain('const [hidden_rows, setHidden_rows] = useState([]);');
    expect(code).toContain('const handleBtnFetchClick = async () => {');
    expect(code).toContain('const handleBtnFetchClickOnSuccess = async (response) => {');
    expect(code).toContain('const handleBtnFetchClickOnError = (error) => {');
    expect(code).toContain('onClick={handleBtnFetchClick}');
    expect(code).toContain('.then(handleBtnFetchClickOnSuccess)');
    expect(code).toContain('.catch(handleBtnFetchClickOnError)');
    expect(code).toContain('await new Promise((resolve) => setTimeout(resolve, 50));');
    expect(code).toContain('setHidden_rows(response);');
  });

  it('keeps legacy __expr support', async () => {
    const code = await compileFormatted(behaviorSchemas.legacyExpressionCompatibility);

    expect(code).toContain('{formData.userName}');
  });

  it('serializes non-string initial values correctly', async () => {
    const code = await compileFormatted(behaviorSchemas.nonStringInitialValues);

    expect(code).toContain(
      'const [hidden_obj, setHidden_obj] = useState({ role: "admin", count: 2 });',
    );
    expect(code).toContain('const [hidden_num, setHidden_num] = useState(3);');
    expect(code).toContain('const [isEnabled, setIsEnabled] = useState(false);');
  });

  it('generates declared Page State and preserves sibling keys on updates', async () => {
    const code = await compileFormatted({
      schemaVersion: 0,
      rootId: 'root',
      logic: { states: { count: 1, ready: false, label: '{{ literal }}' } },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['value', 'increment'] },
        value: { id: 'value', type: 'Text', props: { children: '{{ state.count }}' } },
        increment: {
          id: 'increment',
          type: 'Button',
          props: { children: 'increment' },
          events: {
            onClick: [{ type: 'setValue', field: 'state.count', value: '{{ state.count + 1 }}' }],
          },
        },
      },
    });

    expect(code).toContain(
      'const [state, setState] = useState({ count: 1, ready: false, label: "{{ literal }}" });',
    );
    expect(code).toContain('{state.count}');
    expect(code).toContain('setState((state) => ({ ...state, count: state.count + 1 }));');
  });

  it.each(['assign', 'freeze', 'eval'])(
    'reads non-call JSON Page State member %s consistently with Renderer',
    async (key) => {
      const code = await compileFormatted({
        schemaVersion: 0,
        rootId: 'root',
        logic: { states: { [key]: 1 } },
        components: {
          root: { id: 'root', type: 'Text', props: { children: `{{ state.${key} }}` } },
        },
      });

      expect(code).toContain(`${key}: 1`);
      expect(code).toContain(`{state.${key}}`);
    },
  );

  it('defines empty Page State for legacy state actions instead of emitting an unbound setter', async () => {
    const code = await compileFormatted({
      schemaVersion: 0,
      rootId: 'button',
      components: {
        button: {
          id: 'button',
          type: 'Button',
          events: { onClick: [{ type: 'setValue', field: 'state.open', value: true }] },
        },
      },
    });

    expect(code).toContain('const [state, setState] = useState({});');
    expect(code).toContain('setState((state) => ({ ...state, open: true }));');
  });

  it('matches Renderer shallow-merge semantics for Page State', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'merge',
      logic: { states: { profile: { name: 'Ada' } } },
      components: {
        merge: {
          id: 'merge',
          type: 'Button',
          events: {
            onClick: [
              {
                type: 'setValue',
                field: 'state.profile',
                value: { age: 37 },
                merge: true,
              },
            ],
          },
        },
      },
    });
    let currentState: unknown;
    const useState = (initialState: unknown) => {
      currentState = initialState;
      return [
        initialState,
        (update: unknown) => {
          currentState =
            typeof update === 'function'
              ? (update as (state: unknown) => unknown)(currentState)
              : update;
        },
      ];
    };
    const handlerFactory = new Function(
      'useState',
      `${extractGeneratedComponentBody(code)}\nreturn handleMergeClick;`,
    );

    const handler = handlerFactory(useState) as () => void;
    handler();

    expect(currentState).toEqual({ profile: { name: 'Ada', age: 37 } });
  });

  it('preserves a legacy nested State write in generated code', () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'update',
      components: {
        update: {
          id: 'update',
          type: 'Button',
          events: {
            onClick: [
              { type: 'setValue', field: 'state.profile.name', value: 'Ada' },
              { type: 'setValue', field: 'state.profile.age', value: 37 },
            ],
          },
        },
      },
    });
    let currentState: unknown;
    const useState = (initialState: unknown) => {
      currentState = initialState;
      return [
        initialState,
        (update: unknown) => {
          currentState =
            typeof update === 'function'
              ? (update as (state: unknown) => unknown)(currentState)
              : update;
        },
      ];
    };
    const handlerFactory = new Function(
      'useState',
      `${extractGeneratedComponentBody(code)}\nreturn handleUpdateClick;`,
    );

    const handler = handlerFactory(useState) as () => void;
    handler();

    expect(currentState).toEqual({ profile: { name: 'Ada', age: 37 } });
  });

  it('preserves a legacy nested API result target in generated code', async () => {
    const code = compileToCode({
      schemaVersion: 0,
      rootId: 'load',
      components: {
        load: {
          id: 'load',
          type: 'Button',
          events: {
            onClick: [{ type: 'apiCall', url: '/profile', resultTo: 'state.user.profile' }],
          },
        },
      },
    });
    let currentState: unknown;
    const useState = (initialState: unknown) => {
      currentState = initialState;
      return [
        initialState,
        (update: unknown) => {
          currentState =
            typeof update === 'function'
              ? (update as (state: unknown) => unknown)(currentState)
              : update;
        },
      ];
    };
    const fetchMock = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ name: 'Ada' }) }),
    );
    const handlerFactory = new Function(
      'useState',
      'fetch',
      `${extractGeneratedComponentBody(code)}\nreturn handleLoadClick;`,
    );

    const handler = handlerFactory(useState, fetchMock) as () => void;
    handler();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(currentState).toEqual({ user: { profile: { name: 'Ada' } } });
  });

  it('does not mistake static state-like text for the Page State namespace', async () => {
    const code = await compileFormatted({
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['input', 'help'] },
        input: { id: 'input', type: 'Input', props: { field: 'state', defaultValue: 'draft' } },
        help: { id: 'help', type: 'Text', props: { children: 'Use state.value in an expression' } },
      },
    });

    expect(code).toContain('const [state, setState] = useState("draft");');
    expect(code).not.toContain('useState({});');
  });

  it('keeps a legacy state field authoritative when expressions reference that binding', async () => {
    const code = await compileFormatted({
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['input', 'value'] },
        input: { id: 'input', type: 'Input', props: { field: 'state', defaultValue: 'draft' } },
        value: { id: 'value', type: 'Text', props: { children: '{{ state }}' } },
      },
    });

    expect(code).toContain('const [state, setState] = useState("draft");');
    expect(code).toContain('{state}');
    expect(code).not.toContain('stateField');
    expect(code).not.toContain('useState({});');
  });

  it('fails closed when a legacy state field conflicts with declared Page State', () => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { states: { count: 1 } },
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['input'] },
          input: { id: 'input', type: 'Input', props: { field: 'state', defaultValue: 'draft' } },
        },
      }),
    ).toThrow(/conflicts with the reserved Page State binding/);
  });

  it.each([
    ['state', 'stateField'],
    ['stateField', 'state'],
  ])('rejects state binding collisions independent of field order: %s, %s', (first, second) => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { states: { count: 1 } },
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['first', 'second'] },
          first: { id: 'first', type: 'Input', props: { field: first } },
          second: { id: 'second', type: 'Input', props: { field: second } },
        },
      }),
    ).toThrow(/conflicts with the reserved Page State binding/);
  });

  it('rejects State whose generated setter would shadow the Page State setter', () => {
    expect(() =>
      compileToCode({
        schemaVersion: 0,
        rootId: 'root',
        logic: { states: { count: 1 } },
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['input'] },
          input: { id: 'input', type: 'Input', props: { field: 'State', defaultValue: 'draft' } },
        },
      }),
    ).toThrow(/conflicts with the reserved Page State binding/);
  });

  it('rejects customScript at compile entry', async () => {
    expect(() => compileToCode(behaviorSchemas.customScriptSchema as any)).toThrow(/customScript/);
  });

  it('sanitizes unsafe navigate urls', async () => {
    const code = await compileFormatted(behaviorSchemas.unsafeNavigateSchema);
    expect(code).toContain('window.location.href = "/"');
  });

  it('rejects cycle schemas at compile entry', async () => {
    expect(() => compileToCode(behaviorSchemas.cycleSchema as any)).toThrow('component cycle');
  });

  it('rejects missing node schemas at compile entry', async () => {
    expect(() => compileToCode(behaviorSchemas.missingNodeSchema as any)).toThrow(
      'references missing child',
    );
  });

  it('keeps bypass generate safe with fixed circular comment', async () => {
    const ast = parseSchema(behaviorSchemas.cycleSchema as any);
    transform(ast);
    const code = generate(ast);
    const formatted = await formatCode(code);
    expect(formatted).not.toContain('__PWNED__');
    expect(formatted).toContain('Circular reference omitted');
  });

  it('correctly targets data without referencing state in nested data updates (setValue and resultTo)', async () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['btn1', 'btn2'] },
        btn1: {
          id: 'btn1',
          type: 'Button',
          props: { children: 'Set' },
          events: {
            onClick: [
              {
                type: 'setValue',
                field: 'data.profile.name',
                value: 'Ada',
              },
            ],
          },
        },
        btn2: {
          id: 'btn2',
          type: 'Button',
          props: { children: 'Fetch' },
          events: {
            onClick: [
              {
                type: 'apiCall',
                url: 'https://example.com/api',
                resultTo: 'data.profile.name',
              },
            ],
          },
        },
      },
    };

    const code = await compileFormatted(schema);
    expect(code).toContain(')(data, ["profile","name"], "Ada")');
    expect(code).not.toContain(')(state, ["profile","name"]');
    expect(code).toContain(')(data, ["profile","name"], response)');
  });

  it('declares data state and ref when page declares logic.flows but no logic.states, and component writes to data', async () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        flows: {
          dummyFlow: {
            steps: [
              {
                type: 'delay',
                ms: 10,
              },
            ],
          },
        },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['btn'] },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'Set Data' },
          events: {
            onClick: [
              {
                type: 'setValue',
                field: 'data.key',
                value: 'hello',
              },
            ],
          },
        },
      },
    };

    const code = await compileFormatted(schema);
    expect(code).toContain('const [data, setData] = useState({});');
    expect(code).toContain('const dataRef = useRef(data);');
    expect(code).toContain('let data = dataRef.current;');
    expect(code).toContain('setData(data);');
  });

  it('supports flow steps writing to nested data paths when logic.states is undefined', async () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        flows: {
          updateDataFlow: {
            steps: [
              {
                type: 'setValue',
                field: 'data.profile.name',
                value: 'Ada',
              },
              {
                type: 'apiCall',
                url: 'https://example.com/api',
                resultTo: 'data.profile.name',
              },
            ],
          },
        },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: [] },
      },
    };

    const code = await compileFormatted(schema);
    expect(code).toContain('const [data, setData] = useState({});');
    expect(code).toContain('const dataRef = useRef(data);');
    expect(code).toContain(')(data, ["profile","name"], "Ada")');
    expect(code).toContain(')(data, ["profile","name"], response)');
    expect(code).not.toContain(')(state, ["profile","name"]');
  });
});
