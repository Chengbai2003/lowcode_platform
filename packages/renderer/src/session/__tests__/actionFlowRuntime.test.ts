import { describe, expect, it, vi } from 'vitest';
import {
  analyzeActionFlowDeclarations,
  validatePageSchemaValue,
  type ActionFlowDeclarations,
  type JsonValue,
} from '@lowcode-platform/schema-contract';
import { createRuntimeSession } from '../RuntimeSession';
import {
  FlowExecutionError,
  normalizeFlowExecutionLimits,
  type FlowExecutionLimits,
} from '../FlowRun';
import { EventDispatcher } from '../../EventDispatcher';

function createTestSession(
  flows: ActionFlowDeclarations,
  options?: {
    states?: Record<string, JsonValue>;
    flowLimits?: Partial<FlowExecutionLimits>;
    api?: unknown;
    modal?: unknown;
  },
) {
  const analysisResult = analyzeActionFlowDeclarations(flows);
  if (!analysisResult.ok) {
    throw new Error(`Analysis failed: ${JSON.stringify(analysisResult.issues)}`);
  }

  const dispatcher = new EventDispatcher({
    state: options?.states ?? {},
    api: options?.api,
    ui: { modal: options?.modal },
  });

  const session = createRuntimeSession({
    pageId: 'test-page',
    documentSessionId: 'test-doc-session',
    dispatcher,
    flowAnalysis: analysisResult.value,
    flowExecutionLimits: options?.flowLimits,
  });

  return { session, analysis: analysisResult.value };
}

describe('M1a-2 / F2: Renderer ActionFlow Runtime 矩阵测试', () => {
  it('1. 多步骤严格顺序执行', async () => {
    const { session } = createTestSession({
      main: {
        steps: [
          { type: 'setValue', field: 'state.order', value: 'step1' },
          { type: 'delay', ms: 10 },
          { type: 'setValue', field: 'state.order', value: '{{ state.order + ",step2" }}' },
          { type: 'setValue', field: 'state.order', value: '{{ state.order + ",step3" }}' },
        ],
      },
    });

    const res = await session.executeFlow('main');
    expect(res.status).toBe('success');
    expect(session.runtime.getState().order).toBe('step1,step2,step3');
  });

  it('2. 前一步写 State，后一步读取最新 State', async () => {
    const { session } = createTestSession({
      increment: {
        steps: [
          { type: 'setValue', field: 'state.count', value: 10 },
          { type: 'setValue', field: 'state.count', value: '{{ state.count + 5 }}' },
          { type: 'setValue', field: 'state.count', value: '{{ state.count * 2 }}' },
        ],
      },
    });

    const res = await session.executeFlow('increment');
    expect(res.status).toBe('success');
    expect(session.runtime.getState().count).toBe(30);
  });

  it('3. root input 可用', async () => {
    const { session } = createTestSession({
      greet: {
        steps: [
          { type: 'setValue', field: 'state.greeting', value: '{{ "Hello, " + input.name }}' },
        ],
      },
    });

    const res = await session.executeFlow('greet', { name: 'Alice' });
    expect(res.status).toBe('success');
    expect(session.runtime.getState().greeting).toBe('Hello, Alice');
  });

  it('4. nested input 解析一次且父子局部变量隔离', async () => {
    const { session } = createTestSession({
      parent: {
        steps: [
          { type: 'setValue', field: 'state.prefix', value: 'item' },
          {
            type: 'loop',
            over: [1],
            itemVar: 'item',
            actions: [
              {
                type: 'runFlow',
                flow: 'child',
                input: { name: '{{ state.prefix + "_" + item }}' },
              },
            ],
          },
        ],
      },
      child: {
        steps: [
          { type: 'setValue', field: 'state.childInput', value: '{{ input.name }}' },
          {
            type: 'setValue',
            field: 'state.childItem',
            value: '{{ typeof item === "undefined" ? "isolated" : "leaked" }}',
          },
        ],
      },
    });

    const res = await session.executeFlow('parent');
    expect(res.status).toBe('success');
    expect(session.runtime.getState().childInput).toBe('item_1');
    expect(session.runtime.getState().childItem).toBe('isolated');
  });

  it('5. 普通错误停止后续写入', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('API failed');
      }),
    };
    const { session } = createTestSession(
      {
        failFlow: {
          steps: [
            { type: 'setValue', field: 'state.step1', value: 'written' },
            { type: 'apiCall', url: 'https://example.com/api' },
            { type: 'setValue', field: 'state.step2', value: 'should-not-write' },
          ],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('failFlow')).rejects.toThrow(FlowExecutionError);
    expect(session.runtime.getState().step1).toBe('written');
    expect(session.runtime.getState().step2).toBeUndefined();
  });

  it('6. Flow onError 只执行一次', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('Network failure');
      }),
    };
    const { session } = createTestSession(
      {
        flowWithCatch: {
          steps: [
            { type: 'apiCall', url: 'https://example.com/fail' },
            { type: 'setValue', field: 'state.step2', value: 'unreachable' },
          ],
          onError: [
            { type: 'setValue', field: 'state.recovered', value: true },
            { type: 'setValue', field: 'state.count', value: '{{ (state.count || 0) + 1 }}' },
          ],
        },
      },
      { api: mockApi },
    );

    const res = await session.executeFlow('flowWithCatch');
    expect(res.status).toBe('recovered');
    expect(session.runtime.getState().recovered).toBe(true);
    expect(session.runtime.getState().count).toBe(1);
    expect(session.runtime.getState().step2).toBeUndefined();
  });

  it('7. Flow onError 后不恢复剩余步骤', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('Fail');
      }),
    };
    const { session } = createTestSession(
      {
        flowWithCatch: {
          steps: [
            { type: 'setValue', field: 'state.a', value: 1 },
            { type: 'apiCall', url: 'https://example.com/fail' },
            { type: 'setValue', field: 'state.b', value: 2 },
          ],
          onError: [{ type: 'setValue', field: 'state.inCatch', value: true }],
        },
      },
      { api: mockApi },
    );

    const res = await session.executeFlow('flowWithCatch');
    expect(res.status).toBe('recovered');
    expect(session.runtime.getState().a).toBe(1);
    expect(session.runtime.getState().inCatch).toBe(true);
    expect(session.runtime.getState().b).toBeUndefined();
  });

  it('8. Flow onError 自身失败', async () => {
    const mockApi = {
      get: vi.fn(async (url: string) => {
        if (url.includes('fail-initial')) {
          throw new Error('Initial error');
        }
        throw new Error('Error in catch');
      }),
    };
    const { session } = createTestSession(
      {
        flowWithErrorInCatch: {
          steps: [{ type: 'apiCall', url: 'https://example.com/fail-initial' }],
          onError: [{ type: 'apiCall', url: 'https://example.com/fail-in-catch' }],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('flowWithErrorInCatch')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.step).toBeNull();
      expect(flowErr.stepPath).toEqual(['onError', 0]);
      expect(flowErr.cause).toBeDefined();
      expect((flowErr.cause as Error).message).toContain('Initial error');
      return true;
    });
  });

  it('9. apiCall.onError 成功后 Flow 继续', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('HTTP 500');
      }),
    };
    const { session } = createTestSession(
      {
        flowWithApiCatch: {
          steps: [
            {
              type: 'apiCall',
              url: 'https://example.com/api',
              onError: [{ type: 'setValue', field: 'state.apiErrorHandled', value: true }],
            },
            { type: 'setValue', field: 'state.flowContinued', value: true },
          ],
        },
      },
      { api: mockApi },
    );

    const res = await session.executeFlow('flowWithApiCatch');
    expect(res.status).toBe('success');
    expect(session.runtime.getState().apiErrorHandled).toBe(true);
    expect(session.runtime.getState().flowContinued).toBe(true);
  });

  it('10. if 内错误严格传播', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('If branch error');
      }),
    };
    const { session } = createTestSession(
      {
        flowWithIfError: {
          steps: [
            {
              type: 'if',
              condition: true,
              then: [
                { type: 'setValue', field: 'state.before', value: true },
                { type: 'apiCall', url: 'https://example.com/fail' },
                { type: 'setValue', field: 'state.after', value: true },
              ],
            },
            { type: 'setValue', field: 'state.flowEnd', value: true },
          ],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('flowWithIfError')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.step).toBe(0);
      expect(flowErr.stepPath).toEqual(['steps', 0, 'then', 1]);
      expect(flowErr.path).toEqual(['logic', 'flows', 'flowWithIfError', 'steps', 0, 'then', 1]);
      return true;
    });
    expect(session.runtime.getState().before).toBe(true);
    expect(session.runtime.getState().after).toBeUndefined();
    expect(session.runtime.getState().flowEnd).toBeUndefined();
  });

  it('11. loop 内错误严格传播', async () => {
    let callCount = 0;
    const mockApi = {
      get: vi.fn(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Error on second item');
        return { ok: true };
      }),
    };
    const { session } = createTestSession(
      {
        flowWithLoopError: {
          steps: [
            {
              type: 'loop',
              over: [1, 2, 3],
              itemVar: 'item',
              actions: [
                { type: 'setValue', field: 'state.lastItem', value: '{{ item }}' },
                { type: 'apiCall', url: 'https://example.com/api' },
              ],
            },
            { type: 'setValue', field: 'state.afterLoop', value: true },
          ],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('flowWithLoopError')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.step).toBe(0);
      expect(flowErr.stepPath).toEqual(['steps', 0, 'actions', 1]);
      return true;
    });
    expect(session.runtime.getState().lastItem).toBe(2);
    expect(session.runtime.getState().afterLoop).toBeUndefined();
  });

  it('12. API/dialog callback 内错误严格传播', async () => {
    const mockApi = {
      get: vi.fn(async (url: string) => {
        if (url.includes('nested-fail')) {
          throw new Error('Nested fail');
        }
        return { data: 123 };
      }),
    };
    const { session } = createTestSession(
      {
        flowWithApiSuccessError: {
          steps: [
            {
              type: 'apiCall',
              url: 'https://example.com/ok',
              onSuccess: [{ type: 'apiCall', url: 'https://example.com/nested-fail' }],
            },
            { type: 'setValue', field: 'state.done', value: true },
          ],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('flowWithApiSuccessError')).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        const flowErr = err as FlowExecutionError;
        expect(flowErr.code).toBe('FLOW_STEP_FAILED');
        expect(flowErr.step).toBe(0);
        expect(flowErr.stepPath).toEqual(['steps', 0, 'onSuccess', 0]);
        return true;
      },
    );
    expect(session.runtime.getState().done).toBeUndefined();

    // Dialog callback
    const mockModal = {
      confirm: vi.fn(async () => true),
    };
    const { session: session2 } = createTestSession(
      {
        flowWithDialogError: {
          steps: [
            {
              type: 'dialog',
              kind: 'confirm',
              content: 'Are you sure?',
              onOk: [{ type: 'apiCall', url: 'https://example.com/nested-fail' }],
            },
          ],
        },
      },
      { modal: mockModal, api: mockApi },
    );

    await expect(session2.executeFlow('flowWithDialogError')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.step).toBe(0);
      expect(flowErr.stepPath).toEqual(['steps', 0, 'onOk', 0]);
      return true;
    });
  });

  it('13. 嵌套 Flow 成功、恢复和失败', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('Nested fail');
      }),
    };
    const { session } = createTestSession(
      {
        rootSuccess: {
          steps: [
            { type: 'runFlow', flow: 'childSuccess' },
            { type: 'setValue', field: 'state.rootFinished', value: true },
          ],
        },
        childSuccess: {
          steps: [{ type: 'setValue', field: 'state.childFinished', value: true }],
        },
        rootWithChildCatch: {
          steps: [
            { type: 'runFlow', flow: 'childRecovered' },
            { type: 'setValue', field: 'state.rootContinued', value: true },
          ],
        },
        childRecovered: {
          steps: [{ type: 'apiCall', url: 'https://example.com/fail' }],
          onError: [{ type: 'setValue', field: 'state.childCatch', value: true }],
        },
        rootCatchesChild: {
          steps: [{ type: 'runFlow', flow: 'childUncaught' }],
          onError: [{ type: 'setValue', field: 'state.rootCatch', value: true }],
        },
        childUncaught: {
          steps: [{ type: 'apiCall', url: 'https://example.com/fail' }],
        },
        rootFailsChildFails: {
          steps: [{ type: 'runFlow', flow: 'childUncaught' }],
        },
      },
      { api: mockApi },
    );

    // 13a: child succeeds
    const res1 = await session.executeFlow('rootSuccess');
    expect(res1.status).toBe('success');
    expect(session.runtime.getState().childFinished).toBe(true);
    expect(session.runtime.getState().rootFinished).toBe(true);

    // 13b: child recovered
    const res2 = await session.executeFlow('rootWithChildCatch');
    expect(res2.status).toBe('success');
    expect(session.runtime.getState().childCatch).toBe(true);
    expect(session.runtime.getState().rootContinued).toBe(true);

    // 13c: parent catches child uncaught error
    const res3 = await session.executeFlow('rootCatchesChild');
    expect(res3.status).toBe('recovered');
    expect(session.runtime.getState().rootCatch).toBe(true);

    // 13d: neither catches -> rejects
    await expect(session.executeFlow('rootFailsChildFails')).rejects.toThrow(FlowExecutionError);
  });

  it('14. 嵌套失败 trace 根到叶准确', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('Leaf failure');
      }),
    };
    const { session } = createTestSession(
      {
        flowA: {
          steps: [
            { type: 'setValue', field: 'state.step0', value: 'a0' },
            { type: 'runFlow', flow: 'flowB' },
          ],
        },
        flowB: {
          steps: [
            { type: 'setValue', field: 'state.step0', value: 'b0' },
            { type: 'setValue', field: 'state.step1', value: 'b1' },
            { type: 'runFlow', flow: 'flowC' },
          ],
        },
        flowC: {
          steps: [
            {
              type: 'if',
              condition: true,
              then: [{ type: 'apiCall', url: 'https://example.com/fail' }],
            },
          ],
        },
      },
      { api: mockApi },
    );

    await expect(session.executeFlow('flowA')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.flow).toBe('flowC');
      expect(flowErr.step).toBe(0);
      expect(flowErr.stepPath).toEqual(['steps', 0, 'then', 0]);
      expect(flowErr.path).toEqual(['logic', 'flows', 'flowC', 'steps', 0, 'then', 0]);
      expect(flowErr.trace).toEqual([
        { flow: 'flowA', step: 1 },
        { flow: 'flowB', step: 2 },
        { flow: 'flowC', step: 0 },
      ]);
      return true;
    });
  });

  it('15. delay dispose 后中止且无后续写入', async () => {
    const { session } = createTestSession({
      delayedFlow: {
        steps: [
          { type: 'setValue', field: 'state.start', value: true },
          { type: 'delay', ms: 100 },
          { type: 'setValue', field: 'state.end', value: true },
        ],
      },
    });

    const promise = session.executeFlow('delayedFlow');
    setTimeout(() => {
      session.dispose();
    }, 20);

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_ABORTED');
      return true;
    });
    expect(session.runtime.getState().start).toBe(true);
    expect(session.runtime.getState().end).toBeUndefined();
  });

  it('16. API 继承 signal', async () => {
    let receivedSignal: AbortSignal | undefined;
    const mockApi = {
      get: vi.fn(async (_url: string, _params: unknown, signal?: AbortSignal) => {
        receivedSignal = signal;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100));
      }),
    };

    const { session } = createTestSession(
      {
        apiFlow: {
          steps: [{ type: 'apiCall', url: 'https://example.com/api' }],
        },
      },
      { api: mockApi },
    );

    const promise = session.executeFlow('apiFlow');
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(false);

    session.dispose();
    expect(receivedSignal?.aborted).toBe(true);
    await expect(promise).rejects.toThrow(FlowExecutionError);
  });

  it('17. API 忽略 abort 并晚返回时无写回、无 onSuccess', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { secret: 'pwned' };
      }),
    };

    const { session } = createTestSession(
      {
        slowApiFlow: {
          steps: [
            {
              type: 'apiCall',
              url: 'https://example.com/slow',
              resultTo: 'state.secret',
              onSuccess: [{ type: 'setValue', field: 'state.successCallback', value: true }],
            },
          ],
        },
      },
      { api: mockApi },
    );

    const promise = session.executeFlow('slowApiFlow');
    setTimeout(() => session.dispose(), 20);

    await expect(promise).rejects.toThrow(FlowExecutionError);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(session.runtime.getState().secret).toBeUndefined();
    expect(session.runtime.getState().successCallback).toBeUndefined();
  });

  it('18. dialog 晚返回时无 callback', async () => {
    let resolveModal: (val: boolean) => void;
    const mockModal = {
      confirm: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveModal = resolve;
          }),
      ),
    };

    const { session } = createTestSession(
      {
        dialogFlow: {
          steps: [
            {
              type: 'dialog',
              kind: 'confirm',
              content: 'Prompt',
              onOk: [{ type: 'setValue', field: 'state.onOkRan', value: true }],
            },
          ],
        },
      },
      { modal: mockModal },
    );

    const promise = session.executeFlow('dialogFlow');
    session.dispose();

    resolveModal!(true);

    await expect(promise).rejects.toThrow(FlowExecutionError);
    expect(session.runtime.getState().onOkRan).toBeUndefined();
  });

  it('19. Abort 不执行任何 onError', async () => {
    const { session } = createTestSession({
      abortWithCatch: {
        steps: [
          { type: 'delay', ms: 100 },
          { type: 'setValue', field: 'state.after', value: true },
        ],
        onError: [
          {
            type: 'setValue',
            field: 'state.catchRan',
            value: true,
          },
        ],
      },
    });

    const promise = session.executeFlow('abortWithCatch');
    setTimeout(() => session.dispose(), 20);

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_ABORTED');
      return true;
    });
    expect(session.runtime.getState().catchRan).toBeUndefined();
    expect(session.runtime.getState().after).toBeUndefined();
  });

  describe('20. 五项预算均验证“边界成功、超一失败”', () => {
    it('20a. maxExecutedActions 边界与超一', async () => {
      const { session } = createTestSession(
        {
          threeActions: {
            steps: [
              { type: 'setValue', field: 'state.a', value: 1 },
              { type: 'setValue', field: 'state.b', value: 2 },
              { type: 'setValue', field: 'state.c', value: 3 },
            ],
          },
          fourActions: {
            steps: [
              { type: 'setValue', field: 'state.a', value: 1 },
              { type: 'setValue', field: 'state.b', value: 2 },
              { type: 'setValue', field: 'state.c', value: 3 },
              { type: 'setValue', field: 'state.d', value: 4 },
            ],
          },
        },
        { flowLimits: { maxExecutedActions: 3 } },
      );

      const okRes = await session.executeFlow('threeActions');
      expect(okRes.status).toBe('success');

      await expect(session.executeFlow('fourActions')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_ACTION_BUDGET_EXCEEDED');
        return true;
      });
    });

    it('20b. maxLoopIterations 边界与超一', async () => {
      const { session } = createTestSession(
        {
          loopThree: {
            steps: [
              {
                type: 'loop',
                over: [1, 2, 3],
                itemVar: 'i',
                actions: [{ type: 'setValue', field: 'state.i', value: '{{ i }}' }],
              },
            ],
          },
          loopFour: {
            steps: [
              {
                type: 'loop',
                over: [1, 2, 3, 4],
                itemVar: 'i',
                actions: [{ type: 'setValue', field: 'state.i', value: '{{ i }}' }],
              },
            ],
          },
        },
        { flowLimits: { maxLoopIterations: 3, maxExecutedActions: 50 } },
      );

      const okRes = await session.executeFlow('loopThree');
      expect(okRes.status).toBe('success');

      await expect(session.executeFlow('loopFour')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_ITERATION_BUDGET_EXCEEDED');
        return true;
      });
    });

    it('20c. maxFlowDepth 边界与超一', async () => {
      const { session } = createTestSession(
        {
          depth1: {
            steps: [{ type: 'runFlow', flow: 'depth2' }],
          },
          depth2: {
            steps: [{ type: 'setValue', field: 'state.atDepth2', value: true }],
          },
          depthTooDeep: {
            steps: [{ type: 'runFlow', flow: 'depth2Call3' }],
          },
          depth2Call3: {
            steps: [{ type: 'runFlow', flow: 'depth3' }],
          },
          depth3: {
            steps: [{ type: 'setValue', field: 'state.atDepth3', value: true }],
          },
        },
        { flowLimits: { maxFlowDepth: 2 } },
      );

      const okRes = await session.executeFlow('depth1');
      expect(okRes.status).toBe('success');
      expect(session.runtime.getState().atDepth2).toBe(true);

      await expect(session.executeFlow('depthTooDeep')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_DEPTH_EXCEEDED');
        return true;
      });
    });

    it('20d. maxConcurrentRuns 边界与超一', async () => {
      const { session } = createTestSession(
        {
          slowFlow: {
            steps: [{ type: 'delay', ms: 50 }],
          },
        },
        { flowLimits: { maxConcurrentRuns: 2 } },
      );

      const run1 = session.executeFlow('slowFlow');
      const run2 = session.executeFlow('slowFlow');

      await expect(session.executeFlow('slowFlow')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_CONCURRENCY_EXCEEDED');
        return true;
      });

      await Promise.all([run1, run2]);
    });

    it('20e. maxDurationMs 边界与超一', async () => {
      const { session } = createTestSession(
        {
          fast: {
            steps: [{ type: 'delay', ms: 20 }],
          },
          slow: {
            steps: [{ type: 'delay', ms: 100 }],
          },
        },
        { flowLimits: { maxDurationMs: 50 } },
      );

      const okRes = await session.executeFlow('fast');
      expect(okRes.status).toBe('success');

      await expect(session.executeFlow('slow')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_DURATION_EXCEEDED');
        return true;
      });
    });
  });

  it('21. 并发 FlowRun 互不污染', async () => {
    const { session } = createTestSession({
      workerA: {
        steps: [
          { type: 'delay', ms: 20 },
          { type: 'setValue', field: 'state.worker_A', value: '{{ input.val }}' },
        ],
      },
      workerB: {
        steps: [
          { type: 'delay', ms: 20 },
          { type: 'setValue', field: 'state.worker_B', value: '{{ input.val }}' },
        ],
      },
    });

    const p1 = session.executeFlow('workerA', { val: 100 });
    const p2 = session.executeFlow('workerB', { val: 200 });

    await Promise.all([p1, p2]);
    expect(session.runtime.getState().worker_A).toBe(100);
    expect(session.runtime.getState().worker_B).toBe(200);
  });

  it('22. 完成、失败、取消后无 timer/listener/并发槽泄漏', async () => {
    const mockApi = {
      get: vi.fn(async () => {
        throw new Error('Fail');
      }),
    };
    const { session } = createTestSession(
      {
        successFlow: { steps: [{ type: 'setValue', field: 'state.x', value: 1 }] },
        failFlow: { steps: [{ type: 'apiCall', url: 'https://example.com/fail' }] },
        abortFlow: { steps: [{ type: 'delay', ms: 100 }] },
      },
      { api: mockApi, flowLimits: { maxConcurrentRuns: 1 } },
    );

    // Success frees slot
    await session.executeFlow('successFlow');
    // Next run can acquire slot
    await expect(session.executeFlow('failFlow')).rejects.toThrow();
    // Next run can acquire slot
    const p = session.executeFlow('abortFlow');
    session.dispose();
    await expect(p).rejects.toThrow();
    // Slot was cleaned up
    expect((session as any).activeRootRuns.size).toBe(0);
  });

  it('23. 未知 Flow 和未知 Step fail-close', async () => {
    // 23a. 未知 Flow 在合法 analysis 下直接 fail-close
    const { session } = createTestSession({
      knownFlow: {
        steps: [{ type: 'setValue', field: 'state.x', value: 1 }],
      },
    });

    await expect(session.executeFlow('nonExistentFlow')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      expect((err as FlowExecutionError).code).toBe('FLOW_NOT_FOUND');
      return true;
    });

    // 23b. 模拟畸形/未经分析的 Step 在运行时由 FlowRun 守卫 fail-close
    const forgedAnalysis = {
      nodes: [],
      flows: {
        unsupportedStepFlow: {
          steps: [{ type: 'unknownStepType' as any }],
        },
        customScriptFlow: {
          steps: [{ type: 'customScript' as any }],
        },
      },
      order: ['unsupportedStepFlow', 'customScriptFlow'],
    };
    const forgedSession = createRuntimeSession({
      pageId: 'forged',
      documentSessionId: 'forged-doc',
      flowAnalysis: forgedAnalysis,
    });

    await expect(forgedSession.executeFlow('unsupportedStepFlow')).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_UNSUPPORTED_STEP');
        return true;
      },
    );

    await expect(forgedSession.executeFlow('customScriptFlow')).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_UNSUPPORTED_STEP');
        return true;
      },
    );
  });

  it('24. analysis/schema 未被修改', async () => {
    const originalFlows: ActionFlowDeclarations = {
      testFlow: {
        steps: [{ type: 'setValue', field: 'state.x', value: 1 }],
        onError: [{ type: 'setValue', field: 'state.recovered', value: true }],
      },
    };
    const { session, analysis } = createTestSession(originalFlows);
    const analysisSnapshot = JSON.stringify(analysis);

    await session.executeFlow('testFlow');

    expect(JSON.stringify(analysis)).toBe(analysisSnapshot);
    expect(Object.isFrozen(analysis)).toBe(true);
  });

  it('25. Legacy executor 继续执行行为不变', async () => {
    const dispatcher = new EventDispatcher({ state: { count: 0 } });

    const batchResult = await dispatcher.execute([
      { type: 'setValue', field: 'state.step1', value: 'done' },
      { type: 'setValue', field: '', value: 'fail-step' }, // throws error
      { type: 'setValue', field: 'state.step2', value: 'done' },
    ]);

    expect(batchResult.total).toBe(3);
    expect(batchResult.success).toBe(2);
    expect(batchResult.failed).toBe(1);
    expect(dispatcher.getRuntime().getState().step1).toBe('done');
    expect(dispatcher.getRuntime().getState().step2).toBe('done');
  });

  it('26. logic.flows 和组件 runFlow 生产入口仍被拒绝', () => {
    // 1. validatePageSchemaValue rejects logic.flows
    const pageWithFlows = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'container', props: {} },
      },
      logic: {
        flows: {
          submit: { steps: [{ type: 'setValue', field: 'state.x', value: 1 }] },
        },
      },
    };
    const res1 = validatePageSchemaValue(pageWithFlows);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.issues.some((i) => i.code === 'UNKNOWN_LOGIC_FIELD')).toBe(true);
    }

    // 2. Component event rejects runFlow
    const pageWithComponentRunFlow = {
      schemaVersion: 0 as const,
      rootId: 'btn-1',
      components: {
        'btn-1': {
          id: 'btn-1',
          type: 'button',
          events: {
            onClick: [{ type: 'runFlow', flow: 'submit' }],
          },
        },
      },
    };
    const res2 = validatePageSchemaValue(pageWithComponentRunFlow);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.issues.some((i) => i.code === 'UNSUPPORTED_ACTION_TYPE')).toBe(true);
    }

    // 3. Executing runFlow outside FlowRun in Legacy context fails
    const dispatcher = new EventDispatcher();
    expect(dispatcher.execute([{ type: 'runFlow', flow: 'test' } as any])).resolves.toMatchObject({
      failed: 1,
      results: [
        {
          success: false,
          error: expect.objectContaining({
            message: expect.stringContaining(
              'runFlow action can only be executed within an active FlowRun',
            ),
          }),
        },
      ],
    });
  });

  it('27. 预算配置拒绝非法输入（0、负数、小数、NaN、Infinity、超过硬上限）', () => {
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: 0 })).toThrow(
      /maxExecutedActions/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: -1 })).toThrow(
      /maxExecutedActions/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: 1.5 })).toThrow(
      /maxExecutedActions/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: NaN })).toThrow(
      /maxExecutedActions/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: Infinity })).toThrow(
      /maxExecutedActions/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxExecutedActions: 100001 })).toThrow(
      /maxExecutedActions/,
    );

    expect(() => normalizeFlowExecutionLimits({ maxLoopIterations: 0 })).toThrow(
      /maxLoopIterations/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxLoopIterations: 100001 })).toThrow(
      /maxLoopIterations/,
    );

    expect(() => normalizeFlowExecutionLimits({ maxFlowDepth: 0 })).toThrow(/maxFlowDepth/);
    expect(() => normalizeFlowExecutionLimits({ maxFlowDepth: 65 })).toThrow(/maxFlowDepth/);

    expect(() => normalizeFlowExecutionLimits({ maxConcurrentRuns: 0 })).toThrow(
      /maxConcurrentRuns/,
    );
    expect(() => normalizeFlowExecutionLimits({ maxConcurrentRuns: 129 })).toThrow(
      /maxConcurrentRuns/,
    );

    expect(() => normalizeFlowExecutionLimits({ maxDurationMs: 0 })).toThrow(/maxDurationMs/);
    expect(() => normalizeFlowExecutionLimits({ maxDurationMs: 300001 })).toThrow(/maxDurationMs/);
  });

  it('28. modal 或 host api 永不 settle 时及时取消并释放槽位', async () => {
    let unhandledRejectionFired = false;
    const onUnhandled = () => {
      unhandledRejectionFired = true;
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      let rejectApi!: (reason?: unknown) => void;
      const apiPromise = new Promise((_resolve, reject) => {
        rejectApi = reject;
      });

      let rejectModal!: (reason?: unknown) => void;
      const modalPromise = new Promise((_resolve, reject) => {
        rejectModal = reject;
      });

      const { session } = createTestSession(
        {
          hangingApiFlow: {
            steps: [{ type: 'apiCall', url: 'https://api.example.com/hang' }],
          },
          hangingModalFlow: {
            steps: [{ type: 'dialog', title: 'Confirm', content: 'msg', kind: 'confirm' }],
          },
          quickFlow: {
            steps: [{ type: 'setValue', field: 'state.done', value: true }],
          },
        },
        {
          flowLimits: { maxDurationMs: 40, maxConcurrentRuns: 1 },
          api: {
            get: () => apiPromise,
          },
          modal: {
            confirm: () => modalPromise,
          },
        },
      );

      const start = Date.now();
      await expect(session.executeFlow('hangingApiFlow')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_DURATION_EXCEEDED');
        return true;
      });
      const elapsed = Date.now() - start;
      // 立即 reject，不等待挂起的 Promise
      expect(elapsed).toBeLessThan(200);

      // activeRootRuns 并发槽立即释放，随后可执行另一个 Flow
      const quickRes = await session.executeFlow('quickFlow');
      expect(quickRes.status).toBe('success');
      expect(session.runtime.getState().done).toBe(true);

      // 随后让 hanging API promise reject，验证不触发 unhandled rejection
      rejectApi(new Error('late api rejection'));
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandledRejectionFired).toBe(false);

      // 1b. modal Promise 在 session.dispose() 时仍处于 pending
      const p = session.executeFlow('hangingModalFlow');
      session.dispose();
      await expect(p).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_ABORTED');
        return true;
      });

      // await FLOW_ABORTED 后，再让 modal Promise late reject
      rejectModal(new Error('late modal rejection'));
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandledRejectionFired).toBe(false);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('29. 宿主同步/微任务占用超过 deadline 必须失败为 FLOW_DURATION_EXCEEDED', async () => {
    const { session } = createTestSession(
      {
        blockingFlow: {
          steps: [
            { type: 'apiCall', url: 'https://api.example.com/block' },
            { type: 'setValue', field: 'state.afterBlock', value: 'should-not-run' },
          ],
        },
      },
      {
        flowLimits: { maxDurationMs: 30 },
        api: {
          get: async () => {
            // 同步阻塞超过 deadline (忙等待 50ms)
            const start = Date.now();
            while (Date.now() - start < 50) {
              // busy wait
            }
            return { ok: true };
          },
        },
      },
    );

    await expect(session.executeFlow('blockingFlow')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      expect((err as FlowExecutionError).code).toBe('FLOW_DURATION_EXCEEDED');
      return true;
    });

    expect(session.runtime.getState().afterBlock).toBeUndefined();
  });

  it('30. apiCall.onSuccess 内 runFlow 触发 maxFlowDepth 不得被 apiCall.onError 或 Flow.onError 吞没', async () => {
    const { session } = createTestSession(
      {
        rootFlow: {
          steps: [
            {
              type: 'apiCall',
              url: 'https://api.example.com/trigger-depth',
              onSuccess: [{ type: 'runFlow', flow: 'deepFlow1' }],
              onError: [{ type: 'setValue', field: 'state.apiOnErrorRan', value: true }],
            },
            { type: 'setValue', field: 'state.subsequentStepRan', value: true },
          ],
          onError: [{ type: 'setValue', field: 'state.flowOnErrorRan', value: true }],
        },
        deepFlow1: {
          steps: [{ type: 'runFlow', flow: 'deepFlow2' }],
        },
        deepFlow2: {
          steps: [{ type: 'setValue', field: 'state.deepRan', value: true }],
        },
      },
      {
        flowLimits: { maxFlowDepth: 2 }, // rootFlow (depth 1) -> deepFlow1 (depth 2) -> deepFlow2 exceeds!
        api: {
          get: async () => ({ success: true }),
        },
      },
    );

    await expect(session.executeFlow('rootFlow')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      expect((err as FlowExecutionError).code).toBe('FLOW_DEPTH_EXCEEDED');
      return true;
    });

    const state = session.runtime.getState();
    expect(state.apiOnErrorRan).toBeUndefined();
    expect(state.flowOnErrorRan).toBeUndefined();
    expect(state.subsequentStepRan).toBeUndefined();
  });

  it('31. 根包收紧导出：不导出 FlowRun 及内部 Symbol 与 helper', async () => {
    const rootExports = await import('../../index');
    expect((rootExports as any).FlowRun).toBeUndefined();
    expect((rootExports as any).FlowRunContext).toBeUndefined();
    expect((rootExports as any).FLOW_RUN_CONTEXT).toBeUndefined();
    expect((rootExports as any).getFlowRunContext).toBeUndefined();
    expect((rootExports as any).withFlowRunPath).toBeUndefined();

    // 验证确实导出了公开的错误类与辅助工具
    expect(rootExports.FlowExecutionError).toBeDefined();
    expect(rootExports.isNonRecoverableFlowErrorCode).toBeDefined();
    expect(rootExports.DEFAULT_FLOW_EXECUTION_LIMITS).toBeDefined();
    expect(rootExports.HARD_FLOW_EXECUTION_LIMITS).toBeDefined();
    expect(rootExports.normalizeFlowExecutionLimits).toBeDefined();
  });

  it('32. primitive rejection 仅用于生成 message，不得产生 primitive cause', async () => {
    const { session } = createTestSession(
      {
        primitiveErrorFlow: {
          steps: [{ type: 'apiCall', url: 'https://api.example.com/reject-string' }],
        },
      },
      {
        api: {
          get: () => Promise.reject('string rejection reason'),
        },
      },
    );

    await expect(session.executeFlow('primitiveErrorFlow')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(FlowExecutionError);
      const flowErr = err as FlowExecutionError;
      expect(flowErr.code).toBe('FLOW_STEP_FAILED');
      expect(flowErr.message).toContain('string rejection reason');
      expect(flowErr.cause).toBeUndefined();
      return true;
    });
  });

  it('33. 确定性测试：deadline 已过期、timer 尚未执行、宿主 Action 此时 reject 必须抛出 FLOW_DURATION_EXCEEDED 且不执行任何 onError 及后续步骤', async () => {
    let mockTime = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    try {
      let rejectApiCall!: (err: Error) => void;
      const hostPromise = new Promise((_, reject) => {
        rejectApiCall = reject;
      });

      const { session } = createTestSession(
        {
          expiredRejectFlow: {
            steps: [
              {
                type: 'apiCall',
                url: 'https://api.example.com/reject-on-timeout',
                onError: [{ type: 'setValue', field: 'state.apiOnErrorRan', value: true }],
              },
              { type: 'setValue', field: 'state.subsequentStepRan', value: true },
            ],
            onError: [{ type: 'setValue', field: 'state.flowOnErrorRan', value: true }],
          },
        },
        {
          flowLimits: { maxDurationMs: 50 },
          api: {
            get: () => hostPromise,
          },
        },
      );

      const flowPromise = session.executeFlow('expiredRejectFlow');

      // 确定性将时钟推进到超限 (1000 + 50 = 1050, 设为 1060)，此时 timer 定时器尚未触发
      mockTime = 1060;

      // 宿主 Action 发生 reject
      rejectApiCall(new Error('host network failure'));

      await expect(flowPromise).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        const flowErr = err as FlowExecutionError;
        expect(flowErr.code).toBe('FLOW_DURATION_EXCEEDED');
        expect(flowErr.message).toContain('Flow duration exceeded');
        return true;
      });

      const state = session.runtime.getState();
      expect(state.apiOnErrorRan).toBeUndefined();
      expect(state.flowOnErrorRan).toBeUndefined();
      expect(state.subsequentStepRan).toBeUndefined();

      // 验证未声明 Action 级 onError 的异步 Action 在 deadline 过期后 reject，executeWithAbortRace catch 分支同样抛出 FLOW_DURATION_EXCEEDED
      mockTime = 2000;
      let rejectNoOnErrorCall!: (err: Error) => void;
      const noOnErrorPromise = new Promise((_, reject) => {
        rejectNoOnErrorCall = reject;
      });

      const { session: noOnErrorSession } = createTestSession(
        {
          noOnErrorExpiredFlow: {
            steps: [
              { type: 'apiCall', url: 'https://api.example.com/no-action-on-error' },
              { type: 'setValue', field: 'state.afterNoOnError', value: true },
            ],
            onError: [{ type: 'setValue', field: 'state.flowCatchRan', value: true }],
          },
        },
        {
          flowLimits: { maxDurationMs: 40 },
          api: {
            get: () => noOnErrorPromise,
          },
        },
      );

      const noOnErrorFlowPromise = noOnErrorSession.executeFlow('noOnErrorExpiredFlow');
      mockTime = 2050; // 超出 2000 + 40
      rejectNoOnErrorCall(new Error('raw network error'));

      await expect(noOnErrorFlowPromise).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        expect((err as FlowExecutionError).code).toBe('FLOW_DURATION_EXCEEDED');
        return true;
      });
      expect(noOnErrorSession.runtime.getState().afterNoOnError).toBeUndefined();
      expect(noOnErrorSession.runtime.getState().flowCatchRan).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('34. 确定性测试：session.dispose() 后宿主 Action 发生 reject，断言抛出 FLOW_ABORTED 且不会触发未捕获 rejection', async () => {
    let unhandledRejectionFired = false;
    let unhandledReason: unknown;
    const onUnhandled = (reason: unknown) => {
      unhandledRejectionFired = true;
      unhandledReason = reason;
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      let rejectHostAction!: (err: Error) => void;
      const hostPromise = new Promise((_, reject) => {
        rejectHostAction = reject;
      });

      const { session } = createTestSession(
        {
          disposeRejectFlow: {
            steps: [
              {
                type: 'apiCall',
                url: 'https://api.example.com/hang',
                onError: [{ type: 'setValue', field: 'state.actionOnErrorRan', value: true }],
              },
              { type: 'setValue', field: 'state.subsequentStepRan', value: true },
            ],
            onError: [{ type: 'setValue', field: 'state.flowOnErrorRan', value: true }],
          },
        },
        {
          api: {
            get: () => hostPromise,
          },
        },
      );

      const flowPromise = session.executeFlow('disposeRejectFlow');

      // 宿主 Action 进行中，外部主动销毁 Session
      session.dispose();

      // Session dispose 后宿主 Action 发生 reject
      rejectHostAction(new Error('late host failure after session disposed'));

      await expect(flowPromise).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(FlowExecutionError);
        const flowErr = err as FlowExecutionError;
        expect(flowErr.code).toBe('FLOW_ABORTED');
        expect(flowErr.message).toContain('RuntimeSession is disposed');
        return true;
      });

      // 验证未产生全局未捕获 Promise rejection
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(unhandledRejectionFired).toBe(false);
      expect(unhandledReason).toBeUndefined();

      // 验证 Action.onError、Flow.onError 以及后续步骤均未执行
      const state = session.runtime.getState();
      expect(state.actionOnErrorRan).toBeUndefined();
      expect(state.flowOnErrorRan).toBeUndefined();
      expect(state.subsequentStepRan).toBeUndefined();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
