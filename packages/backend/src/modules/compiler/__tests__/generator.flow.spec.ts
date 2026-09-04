import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { compileToCode } from '../generator';

const actionFlowFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-action-flow-conformance.json'),
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
    const cleanup = effect();
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
    `${extractGeneratedComponentBody(code)}\nreturn ${returnedCode};`,
  );

  return {
    value: factory(useState, useMemo, useRef, useEffect, Modal, notification, message),
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

  it('enforces action execution budget (> 200 actions)', async () => {
    // 45 loop iterations * 5 inner actions = 225 runtime actions
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
                type: 'loop',
                over: Array.from({ length: 45 }, (_, i) => i),
                itemVar: 'i',
                actions: [
                  { type: 'setValue', field: 'state.count', value: 1 },
                  { type: 'setValue', field: 'state.count', value: 2 },
                  { type: 'setValue', field: 'state.count', value: 3 },
                  { type: 'setValue', field: 'state.count', value: 4 },
                  { type: 'setValue', field: 'state.count', value: 5 },
                ],
              },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(code, `{ executeFlow }`);

    await expect(harness.value.executeFlow('budgetFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_ACTION_BUDGET_EXCEEDED',
      flow: 'budgetFlow',
    });
  });

  it('enforces loop iteration budget (> 200 iterations)', async () => {
    const largeArray = Array.from({ length: 205 }, (_, i) => i);
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
                over: largeArray,
                itemVar: 'item',
                actions: [],
              },
            ],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(code, `{ executeFlow }`);

    await expect(harness.value.executeFlow('loopBudgetFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_ITERATION_BUDGET_EXCEEDED',
    });
  });

  it('enforces call depth budget (> 16 depth)', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', props: {} },
      },
      logic: {
        states: { done: false },
        flows: {
          targetFlow: {
            steps: [{ type: 'setValue', field: 'state.done', value: true }],
          },
        },
      },
    };

    const code = compileToCode(schema);
    const harness = createFlowHarness(code, `{ executeChildFlow, executeFlow }`);

    // Simulate 16 active callStack frames
    const mockContext = {
      callStack: Array.from({ length: 16 }, (_, i) => ({ flow: `flow_${i}`, step: 0 })),
      throwIfAborted: jest.fn(),
      createError: (code: string) => ({ name: 'FlowExecutionError', code }),
    };

    await expect(
      harness.value.executeChildFlow('targetFlow', undefined, mockContext, 'caller', 0, [
        'steps',
        0,
      ]),
    ).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_DEPTH_EXCEEDED',
    });
  });

  it('enforces concurrency budget (> 8 concurrent flows)', async () => {
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

    const code = compileToCode(schema);
    const harness = createFlowHarness(code, `{ executeFlow }`);

    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 8; i++) {
      promises.push(harness.value.executeFlow('slowFlow'));
    }

    // 9th concurrent flow should immediately reject with FLOW_CONCURRENCY_EXCEEDED
    await expect(harness.value.executeFlow('slowFlow')).rejects.toMatchObject({
      name: 'FlowExecutionError',
      code: 'FLOW_CONCURRENCY_EXCEEDED',
    });

    await Promise.all(promises);
  });

  it('enforces duration budget using monotonic performance.now()', async () => {
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

    const code = compileToCode(schema);
    const harness = createFlowHarness(code, `{ executeFlow }`);

    const realNow = performance.now;
    let mockedTime = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => mockedTime);

    try {
      const flowPromise = harness.value.executeFlow('timeoutFlow');
      // Advance mocked monotonic clock past 30000ms deadline
      mockedTime += 31000;

      await expect(flowPromise).rejects.toMatchObject({
        name: 'FlowExecutionError',
        code: 'FLOW_DURATION_EXCEEDED',
      });
    } finally {
      jest.spyOn(performance, 'now').mockImplementation(realNow);
    }
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
});
