import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { compileToCode } from '../generator';

const actionFlowFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
    'utf8',
  ),
) as {
  schema: PageSchema;
  expected: {
    afterClick: { state: { count: number; source: string } };
    recovery: { state: { recovered: boolean }; result: { status: string; flow: string } };
    unhandledDiagnostic: { code: string; flow: string; step: number; stepPath: string[] };
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

function createFlowHarness(
  code: string,
  returnedCode: string,
  options?: {
    mockModal?: { confirm: jest.Mock; info: jest.Mock };
    mockNotification?: Record<string, jest.Mock>;
    mockMessage?: Record<string, jest.Mock>;
    mockWindow?: { location: { href: string; replace?: jest.Mock } };
    strictEffects?: boolean;
  },
) {
  let renderedState: unknown;
  let unmountCleanup: (() => void) | undefined;
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
    let cleanup = effect();
    if (options?.strictEffects && typeof cleanup === 'function') {
      cleanup();
      cleanup = effect();
    }
    if (typeof cleanup === 'function') {
      unmountCleanup = cleanup;
    }
  };
  const Modal = options?.mockModal || {
    confirm: jest.fn((config) => {
      return { destroy: jest.fn() };
    }),
    info: jest.fn((config) => {
      return { destroy: jest.fn() };
    }),
  };
  const notification = options?.mockNotification || {
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };
  const message = options?.mockMessage || {
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };

  const factory = new Function(
    'useState',
    'useMemo',
    'useRef',
    'useEffect',
    'Modal',
    'notification',
    'message',
    'window',
    `${extractGeneratedComponentBody(code)}\nreturn ${returnedCode};`,
  );

  return {
    value: factory(
      useState,
      useMemo,
      useRef,
      useEffect,
      Modal,
      notification,
      message,
      options?.mockWindow || { location: { href: '' } },
    ),
    getRenderedState: () => renderedState,
    unmount: () => {
      unmountCleanup?.();
    },
    Modal,
    notification,
    message,
  };
}

describe('compiler ActionFlow runtime generation', () => {
  it.each([
    [
      'then',
      {
        type: 'if',
        condition: true,
        then: [
          { type: 'feedback', content: 'ok' },
          { type: 'apiCall', url: '/fail' },
        ],
      },
      ['steps', 0, 'then', 1],
    ],
    [
      'loop actions',
      {
        type: 'loop',
        over: [1],
        itemVar: 'item',
        actions: [
          { type: 'feedback', content: 'ok' },
          { type: 'apiCall', url: '/fail' },
        ],
      },
      ['steps', 0, 'actions', 1],
    ],
    [
      'else',
      {
        type: 'if',
        condition: false,
        then: [],
        else: [
          { type: 'feedback', content: 'ok' },
          { type: 'apiCall', url: '/fail' },
        ],
      },
      ['steps', 0, 'else', 1],
    ],
    [
      'api onError',
      {
        type: 'apiCall',
        url: '/fail',
        onError: [
          { type: 'feedback', content: 'recovering' },
          { type: 'apiCall', url: '/fail' },
        ],
      },
      ['steps', 0, 'onError', 1],
    ],
  ] as const)('reports the nested %s path through executeFlow', async (_name, step, stepPath) => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: { flows: { main: { steps: [step] } } },
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('nested failure'));
    try {
      const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }');
      let caughtError: unknown;
      try {
        await harness.value.executeFlow('main');
      } catch (error) {
        caughtError = error;
      }
      expect(caughtError).toMatchObject({
        code: 'FLOW_STEP_FAILED',
        flow: 'main',
        step: 0,
        stepPath,
        path: ['logic', 'flows', 'main', ...stepPath],
        cause: expect.objectContaining({ message: 'nested failure' }),
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not consume loop iterations for an empty loop body', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        flows: { main: { steps: [{ type: 'loop', over: [1, 2], itemVar: 'item', actions: [] }] } },
      },
    };
    const harness = createFlowHarness(
      compileToCode(schema, { flowExecutionLimits: { maxLoopIterations: 1 } }),
      '{ executeFlow }',
    );
    await expect(harness.value.executeFlow('main')).resolves.toMatchObject({ status: 'success' });
  });

  it('reports api onSuccess and dialog onOk child paths through executeFlow', async () => {
    let onOk: (() => Promise<void>) | undefined;
    let onCancel: (() => Promise<void>) | undefined;
    const modal = {
      confirm: jest.fn((config: { onOk: () => Promise<void>; onCancel: () => Promise<void> }) => {
        onOk = config.onOk;
        onCancel = config.onCancel;
        return { destroy: jest.fn() };
      }),
      info: jest.fn(),
    };
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        flows: {
          success: {
            steps: [
              { type: 'apiCall', url: '/ok', onSuccess: [{ type: 'apiCall', url: '/fail' }] },
            ],
          },
          dialog: {
            steps: [
              {
                type: 'dialog',
                kind: 'confirm',
                content: 'confirm',
                onOk: [{ type: 'apiCall', url: '/fail' }],
              },
            ],
          },
          cancel: {
            steps: [
              {
                type: 'dialog',
                kind: 'confirm',
                content: 'confirm',
                onCancel: [{ type: 'apiCall', url: '/fail' }],
              },
            ],
          },
        },
      },
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      )
      .mockRejectedValue(new Error('nested failure'));
    try {
      const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }', {
        mockModal: modal,
      });
      await expect(harness.value.executeFlow('success')).rejects.toMatchObject({
        code: 'FLOW_STEP_FAILED',
        flow: 'success',
        step: 0,
        stepPath: ['steps', 0, 'onSuccess', 0],
        path: ['logic', 'flows', 'success', 'steps', 0, 'onSuccess', 0],
      });
      const pending = harness.value.executeFlow('dialog');
      await onOk?.();
      await expect(pending).rejects.toMatchObject({
        code: 'FLOW_STEP_FAILED',
        flow: 'dialog',
        step: 0,
        stepPath: ['steps', 0, 'onOk', 0],
        path: ['logic', 'flows', 'dialog', 'steps', 0, 'onOk', 0],
      });
      const cancelled = harness.value.executeFlow('cancel');
      await onCancel?.();
      await expect(cancelled).rejects.toMatchObject({
        code: 'FLOW_STEP_FAILED',
        flow: 'cancel',
        step: 0,
        stepPath: ['steps', 0, 'onCancel', 0],
        path: ['logic', 'flows', 'cancel', 'steps', 0, 'onCancel', 0],
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('writes a literal navigate target through the generated public flow executor', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        flows: { navigate: { steps: [{ type: 'navigate', to: '/orders/42' }] } },
      },
    };
    const mockWindow = { location: { href: '' } };
    const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }', { mockWindow });

    await expect(harness.value.executeFlow('navigate')).resolves.toMatchObject({
      status: 'success',
    });
    expect(mockWindow.location.href).toBe('/orders/42');
  });

  it('resolves dynamic Flow navigation params and uses replace without opening external targets', async () => {
    const replace = jest.fn();
    const mockWindow = { location: { href: '', replace } };
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        states: { dest: '/orders', unsafeDest: 'javascript:alert(1)' },
        flows: {
          replace: {
            steps: [
              {
                type: 'navigate',
                to: '{{state.dest}}',
                params: { id: '{{input.id}}', keep: null },
                replace: true,
              },
            ],
          },
          unsafe: { steps: [{ type: 'navigate', to: '{{state.unsafeDest}}' }] },
        },
      },
    };
    const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }', { mockWindow });

    await expect(harness.value.executeFlow('replace', { id: 42 })).resolves.toMatchObject({
      status: 'success',
    });
    expect(replace).toHaveBeenCalledWith('/orders?id=42&keep=null');
    expect(mockWindow.location.href).toBe('');

    await expect(harness.value.executeFlow('unsafe')).resolves.toMatchObject({ status: 'success' });
    expect(mockWindow.location.href).toBe('/');
  });

  it('maps modal and confirm dialogs to their generated Modal methods', async () => {
    let modalOnOk: (() => Promise<void>) | undefined;
    let confirmOnOk: (() => Promise<void>) | undefined;
    const modal = {
      info: jest.fn((config: { onOk: () => Promise<void> }) => {
        modalOnOk = config.onOk;
        return { destroy: jest.fn() };
      }),
      confirm: jest.fn((config: { onOk: () => Promise<void> }) => {
        confirmOnOk = config.onOk;
        return { destroy: jest.fn() };
      }),
    };
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        flows: {
          modal: { steps: [{ type: 'dialog', kind: 'modal', content: 'notice' }] },
          confirm: { steps: [{ type: 'dialog', kind: 'confirm', content: 'continue?' }] },
        },
      },
    };
    const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }', {
      mockModal: modal,
    });

    const modalRun = harness.value.executeFlow('modal');
    expect(modal.info).toHaveBeenCalledTimes(1);
    expect(modal.confirm).not.toHaveBeenCalled();
    await modalOnOk?.();
    await expect(modalRun).resolves.toMatchObject({ status: 'success' });

    const confirmRun = harness.value.executeFlow('confirm');
    expect(modal.confirm).toHaveBeenCalledTimes(1);
    await confirmOnOk?.();
    await expect(confirmRun).resolves.toMatchObject({ status: 'success' });
  });
  it('executes the shared ActionFlow conformance fixture through its generated event handler', async () => {
    const code = compileToCode(actionFlowFixture.schema);
    const harness = createFlowHarness(
      code,
      '{ handleSubmitClick, executeFlow, read: () => stateRef.current }',
    );

    await harness.value.handleSubmitClick();
    expect(harness.value.read()).toMatchObject(actionFlowFixture.expected.afterClick.state);

    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fixture failure'));
    try {
      await expect(harness.value.executeFlow('recoverFailure')).resolves.toMatchObject(
        actionFlowFixture.expected.recovery.result,
      );
      expect(harness.value.read()).toMatchObject(actionFlowFixture.expected.recovery.state);
      await expect(harness.value.executeFlow('unhandledFailure')).rejects.toMatchObject(
        actionFlowFixture.expected.unhandledDiagnostic,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('strictly executes steps sequentially and reads latest State/Computed across await ticks', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'btn1',
      components: {
        btn1: {
          id: 'btn1',
          type: 'Button',
          props: { label: 'Click Me' },
          events: { onClick: [{ type: 'runFlow', flow: 'seqFlow' }] },
        },
      },
      logic: {
        states: { count: 1, step: 0 },
        computed: { doubleCount: 'state.count * 2' },
        flows: {
          seqFlow: {
            steps: [
              { type: 'setValue', field: 'state.count', value: '{{state.count + 1}}' },
              { type: 'setValue', field: 'state.step', value: 1 },
              { type: 'delay', ms: 5 },
              {
                type: 'setValue',
                field: 'state.count',
                value: '{{state.count + computed.doubleCount}}',
              },
              { type: 'setValue', field: 'state.step', value: 2 },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(
      code,
      `{
        executeFlow,
        handleBtn1Click,
        read: () => ({ state: stateRef.current, computed: computedRef.current })
      }`,
    );

    expect(harness.value.read().state).toEqual({ count: 1, step: 0 });
    expect(harness.value.read().computed).toEqual({ doubleCount: 2 });

    await harness.value.handleBtn1Click();

    // After step 0: count was 2 (doubleCount became 4)
    // After step 2: count became 2 + 4 = 6 (doubleCount became 12), step is 2
    expect(harness.value.read().state).toEqual({ count: 6, step: 2 });
    expect(harness.value.read().computed).toEqual({ doubleCount: 12 });

    const directResult = await harness.value.executeFlow('seqFlow');
    expect(directResult).toEqual({ status: 'success', flow: 'seqFlow', recovered: false });
  });

  it('isolates input parameters and supports nested runFlow', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          props: {},
        },
      },
      logic: {
        states: { accum: 100 },
        flows: {
          childFlow: {
            steps: [
              {
                type: 'setValue',
                field: 'state.accum',
                value: '{{state.accum + input.delta}}',
              },
            ],
          },
          parentFlow: {
            steps: [
              {
                type: 'runFlow',
                flow: 'childFlow',
                input: { delta: 15 },
              },
              {
                type: 'runFlow',
                flow: 'childFlow',
                input: { delta: 25 },
              },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(
      code,
      `{
        executeFlow,
        read: () => ({ state: stateRef.current })
      }`,
    );

    const result = await harness.value.executeFlow('parentFlow');
    expect(result).toEqual({ status: 'success', flow: 'parentFlow', recovered: false });
    expect(harness.value.read().state).toEqual({ accum: 140 });
  });

  it('recovers via flow.onError and stops remaining steps; rethrows when onError absent', async () => {
    const realFetch = global.fetch;
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    try {
      const schemaWithOnError: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', props: {} },
        },
        logic: {
          states: { checkpoint: 0, recovered: false, errMsg: '' },
          flows: {
            flowWithRecovery: {
              steps: [
                { type: 'setValue', field: 'state.checkpoint', value: 1 },
                { type: 'apiCall', url: '/api/fail' },
                { type: 'setValue', field: 'state.checkpoint', value: 2 },
              ],
              onError: [
                { type: 'setValue', field: 'state.recovered', value: true },
                { type: 'setValue', field: 'state.errMsg', value: '{{error}}' },
              ],
            },
            flowWithoutRecovery: {
              steps: [
                { type: 'setValue', field: 'state.checkpoint', value: 10 },
                { type: 'apiCall', url: '/api/fail' },
                { type: 'setValue', field: 'state.checkpoint', value: 20 },
              ],
            },
          },
        },
      };

      const code = compileToCode(schemaWithOnError);
      const harness = createFlowHarness(
        code,
        `{
          executeFlow,
          read: () => ({ state: stateRef.current })
        }`,
      );

      const res = await harness.value.executeFlow('flowWithRecovery');
      expect(res.status).toBe('recovered');
      expect(res.recovered).toBe(true);
      expect(harness.value.read().state.checkpoint).toBe(1);
      expect(harness.value.read().state.recovered).toBe(true);
      expect(harness.value.read().state.errMsg).toContain('Network error');

      // Flow without onError rethrows FlowExecutionError
      await expect(harness.value.executeFlow('flowWithoutRecovery')).rejects.toMatchObject({
        name: 'FlowExecutionError',
        code: 'FLOW_STEP_FAILED',
      });
      expect(harness.value.read().state.checkpoint).toBe(10);
    } finally {
      global.fetch = realFetch;
    }
  });

  it('keeps the primary step diagnostic as cause when onError action 1 fails', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        flows: {
          main: {
            steps: [{ type: 'apiCall', url: '/primary-failure' }],
            onError: [
              { type: 'feedback', content: 'recovery started' },
              { type: 'apiCall', url: '/recovery-failure' },
            ],
          },
        },
      },
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('primary failure'));
    fetchMock.mockRejectedValueOnce(new Error('recovery failure'));
    try {
      const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }');
      let caughtError: unknown;
      try {
        await harness.value.executeFlow('main');
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toMatchObject({
        code: 'FLOW_STEP_FAILED',
        flow: 'main',
        step: null,
        stepPath: ['onError', 1],
        path: ['logic', 'flows', 'main', 'onError', 1],
        cause: expect.objectContaining({
          code: 'FLOW_STEP_FAILED',
          step: 0,
          stepPath: ['steps', 0],
          message: 'primary failure',
        }),
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('enforces a trusted custom action execution budget through executeFlow', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { count: 0 },
        flows: {
          budgetFlow: {
            steps: [
              {
                type: 'setValue',
                field: 'state.count',
                value: 1,
              },
              { type: 'setValue', field: 'state.count', value: 2 },
              { type: 'setValue', field: 'state.count', value: 3 },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema, { flowExecutionLimits: { maxExecutedActions: 2 } });
    const harness = createFlowHarness(code, `{ executeFlow }`);

    await expect(harness.value.executeFlow('budgetFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_ACTION_BUDGET_EXCEEDED',
      flow: 'budgetFlow',
    });
  });

  it('enforces a trusted custom loop iteration budget through executeFlow', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { lastItem: 0 },
        flows: {
          loopBudgetFlow: {
            steps: [
              {
                type: 'loop',
                over: [1, 2, 3],
                itemVar: 'item',
                actions: [{ type: 'feedback', kind: 'message', content: 'tick' }],
              },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema, {
      flowExecutionLimits: { maxExecutedActions: 10, maxLoopIterations: 2 },
    });
    const harness = createFlowHarness(code, `{ executeFlow }`);

    await expect(harness.value.executeFlow('loopBudgetFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_ITERATION_BUDGET_EXCEEDED',
    });
  });

  it('enforces a trusted custom call depth budget through executeFlow', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { done: false },
        flows: {
          first: { steps: [{ type: 'runFlow', flow: 'second' }] },
          second: { steps: [{ type: 'runFlow', flow: 'third' }] },
          third: { steps: [{ type: 'setValue', field: 'state.done', value: true }] },
        },
      },
    };

    const code = compileToCode(schema, { flowExecutionLimits: { maxFlowDepth: 2 } });
    const harness = createFlowHarness(code, `{ executeFlow }`);

    await expect(harness.value.executeFlow('first')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_DEPTH_EXCEEDED',
    });
  });

  it('enforces a trusted custom concurrency budget through executeFlow', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { active: 0 },
        flows: {
          slowFlow: {
            steps: [{ type: 'delay', ms: 50 }],
          },
        },
      },
    };

    const code = compileToCode(schema, { flowExecutionLimits: { maxConcurrentRuns: 1 } });
    const harness = createFlowHarness(code, `{ executeFlow }`);

    const firstRun = harness.value.executeFlow('slowFlow');

    // The second root run should immediately reject while the first delay is pending.
    await expect(harness.value.executeFlow('slowFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_CONCURRENCY_EXCEEDED',
    });

    await firstRun;
  });

  it('enforces a trusted custom duration budget using monotonic performance.now()', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { finished: false },
        flows: {
          timeoutFlow: {
            steps: [
              { type: 'delay', ms: 5 },
              { type: 'setValue', field: 'state.finished', value: true },
            ],
          },
        },
      },
    };

    jest.useFakeTimers();
    const nowSpy = jest.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const code = compileToCode(schema, { flowExecutionLimits: { maxDurationMs: 1 } });
      const harness = createFlowHarness(code, `{ executeFlow }`);
      const flowPromise = harness.value.executeFlow('timeoutFlow');
      jest.advanceTimersByTime(1);

      await expect(flowPromise).rejects.toMatchObject({
        name: 'FlowExecutionError',
        code: 'FLOW_DURATION_EXCEEDED',
      });
    } finally {
      nowSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('clears a pending delay timer when unmount aborts its public flow run', async () => {
    jest.useFakeTimers();
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: { flows: { delayed: { steps: [{ type: 'delay', ms: 1_000 }] } } },
    };

    try {
      const harness = createFlowHarness(compileToCode(schema), '{ executeFlow }');
      const pendingRun = harness.value.executeFlow('delayed');

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      harness.unmount();

      await expect(pendingRun).rejects.toMatchObject({ code: 'FLOW_ABORTED' });
      await Promise.resolve();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('executes a flow after StrictMode effect cleanup and setup replay', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        states: { ran: false },
        flows: { main: { steps: [{ type: 'setValue', field: 'state.ran', value: true }] } },
      },
    };
    const harness = createFlowHarness(
      compileToCode(schema),
      '{ executeFlow, read: () => stateRef.current }',
      {
        strictEffects: true,
      },
    );

    await expect(harness.value.executeFlow('main')).resolves.toMatchObject({ status: 'success' });
    expect(harness.value.read()).toMatchObject({ ran: true });
  });

  it('rejects a stale generated handler after unmount without writing state', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', props: {} } },
      logic: {
        states: { ran: false },
        flows: { main: { steps: [{ type: 'setValue', field: 'state.ran', value: true }] } },
      },
    };
    const harness = createFlowHarness(
      compileToCode(schema),
      '{ executeFlow, read: () => stateRef.current }',
    );

    harness.unmount();

    await expect(harness.value.executeFlow('main')).rejects.toMatchObject({ code: 'FLOW_ABORTED' });
    expect(harness.value.read()).toMatchObject({ ran: false });
  });

  it('unmount aborts in-flight flow, prevents late state write, and protects against unhandledRejection', async () => {
    let modalOnOk: (() => void) | undefined;
    let modalDestroy = jest.fn();

    const mockModal = {
      confirm: jest.fn((config) => {
        modalOnOk = config.onOk;
        return { destroy: modalDestroy };
      }),
      info: jest.fn(),
    };

    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { confirmed: false },
        flows: {
          modalFlow: {
            steps: [
              {
                type: 'dialog',
                kind: 'confirm',
                title: 'Confirm modal',
                content: 'Are you sure?',
                onOk: [{ type: 'setValue', field: 'state.confirmed', value: true }],
              },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(
      code,
      `{
        executeFlow,
        read: () => ({ state: stateRef.current })
      }`,
      { mockModal },
    );

    const flowPromise = harness.value.executeFlow('modalFlow');
    expect(mockModal.confirm).toHaveBeenCalledTimes(1);

    // Component unmounts while modal is pending
    harness.unmount();
    expect(modalDestroy).toHaveBeenCalledTimes(1);

    await expect(flowPromise).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_ABORTED',
    });

    // Late user interaction after unmount
    modalOnOk?.();

    // State was not written after abort
    expect(harness.value.read().state.confirmed).toBe(false);
  });

  it('matches Renderer diagnostics structure (code, flow, step, stepPath, trace)', async () => {
    const realFetch = global.fetch;
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    global.fetch = mockFetch;

    try {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', props: {} },
        },
        logic: {
          states: { x: 1 },
          flows: {
            subFlow: {
              steps: [{ type: 'apiCall', url: '/api/error' }],
            },
            mainFlow: {
              steps: [{ type: 'runFlow', flow: 'subFlow' }],
            },
          },
        },
      };

      const code = compileToCode(schema);
      const harness = createFlowHarness(code, `{ executeFlow }`);

      let caughtError: unknown;
      try {
        await harness.value.executeFlow('mainFlow');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toMatchObject({
        name: 'FlowExecutionError',
        code: 'FLOW_STEP_FAILED',
        flow: 'subFlow',
        step: 0,
        stepPath: ['steps', 0],
        path: ['logic', 'flows', 'subFlow', 'steps', 0],
        trace: [
          { flow: 'mainFlow', step: 0 },
          { flow: 'subFlow', step: 0 },
        ],
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  it('preserves data modifications made during in-flight apiCall without losing intermediate edits', async () => {
    const realFetch = global.fetch;
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const mockFetch = jest.fn().mockImplementation(() => fetchPromise);
    global.fetch = mockFetch;

    try {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', props: {}, childrenIds: ['editBtn'] },
          editBtn: {
            id: 'editBtn',
            type: 'Button',
            events: {
              onClick: [{ type: 'setValue', field: 'data.userEdit', value: 'keep' }],
            },
          },
        },
        logic: {
          flows: {
            loadProfile: {
              steps: [
                {
                  type: 'apiCall',
                  url: '/api/profile',
                  resultTo: 'data.profile',
                },
              ],
            },
          },
        },
      };

      const code = compileToCode(schema);
      const harness = createFlowHarness(
        code,
        `{
          executeFlow,
          handleEditBtnClick,
          readData: () => dataRef.current,
        }`,
      );

      // 1. Trigger the flow that initiates the async API call
      const flowPromise = harness.value.executeFlow('loadProfile');

      // 2. While the request is in flight, an intermediate user action updates data
      harness.value.handleEditBtnClick();
      expect(harness.value.readData()).toEqual({ userEdit: 'keep' });

      // 3. Resolve the API call response
      resolveFetch!({
        ok: true,
        headers: {
          get: (header: string) =>
            header.toLowerCase() === 'content-type' ? 'application/json' : null,
        },
        json: () => Promise.resolve({ server: 'received' }),
        text: () => Promise.resolve(''),
      });

      await flowPromise;

      // 4. Assert both intermediate user edits and API response are retained without data loss
      expect(harness.value.readData()).toEqual({
        userEdit: 'keep',
        profile: { server: 'received' },
      });
    } finally {
      global.fetch = realFetch;
    }
  });
});
