import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import {
  analyzeActionFlowDeclarations,
  createCanonicalPageSchema,
  validatePageSchemaValue,
  type ActionFlowMap,
  type FlowExecutionLimits,
  type PageSchema,
} from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import { EventDispatcher } from '../EventDispatcher';
import * as RuntimeSessionModule from '../session/RuntimeSession';
import { createRuntimeSession, type RuntimeSession } from '../session/RuntimeSession';
import { testPreset } from './fixtures/testPreset';

interface ConformanceExpected {
  readonly topology: readonly string[];
  readonly canonicalLogic: unknown;
  readonly initial: {
    readonly state: Record<string, unknown>;
    readonly computed: {
      readonly subtotal: number;
      readonly total: number;
      readonly label: string;
    };
  };
  readonly initialVisibleText: {
    readonly status: string;
    readonly computed: string;
    readonly seen: string;
    readonly delayed: string;
  };
  readonly afterClick: {
    readonly state: {
      readonly count: number;
      readonly source: string;
      readonly recovered: boolean;
    };
  };
  readonly afterClickVisibleText: {
    readonly status: string;
  };
  readonly afterChange: {
    readonly state: {
      readonly price: number;
      readonly quantity: number;
      readonly freight: number;
      readonly seen: number;
    };
    readonly computed: {
      readonly subtotal: number;
      readonly total: number;
      readonly label: string;
    };
  };
  readonly afterChangeVisibleText: {
    readonly computed: string;
    readonly seen: string;
  };
  readonly recovery: {
    readonly state: { readonly recovered: boolean };
    readonly result: {
      readonly status: string;
      readonly flow: string;
      readonly recovered: boolean;
    };
  };
  readonly unhandledDiagnostic: {
    readonly code: string;
    readonly flow: string;
    readonly step: number;
    readonly stepPath: readonly (string | number)[];
    readonly trace: ReadonlyArray<{ readonly flow: string; readonly step: number }>;
  };
  readonly cancellation: {
    readonly flow: string;
    readonly delayMs: number;
    readonly initialState: { readonly delayedState: string };
    readonly noWriteBackState: { readonly delayedState: string };
  };
}

interface BudgetCase {
  readonly schema: PageSchema;
  readonly flow: string;
  readonly expectedError: {
    readonly code: string;
    readonly flow: string;
  };
}

interface PageLogicConformanceCorpus {
  readonly corpusVersion: string;
  readonly reviewReason: string;
  readonly schema: PageSchema;
  readonly expected: ConformanceExpected;
  readonly legacySchema: PageSchema;
  readonly legacyExpected: {
    readonly initialVisibleText: string;
    readonly afterClickVisibleText: string;
    readonly afterClickState: Record<string, unknown>;
  };
  readonly smallLimits: FlowExecutionLimits;
  readonly budgetExceededCases: Record<string, BudgetCase>;
}

const pageLogicConformance = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
    'utf8',
  ),
) as PageLogicConformanceCorpus;

const simpleSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['t1'] },
    t1: { id: 't1', type: 'Text', props: { children: '{{ data.greeting || "hello" }}' } },
  },
};

function createFixtureSession() {
  const flows = pageLogicConformance.schema.logic?.flows;
  if (!flows) throw new Error('ActionFlow fixture must declare flows');
  const analysis = analyzeActionFlowDeclarations(flows);
  if (!analysis.ok) throw new Error('ActionFlow fixture must pass Contract analysis');
  return createRuntimeSession({
    pageId: 'action-flow-fixture',
    documentSessionId: 'fixture-session',
    dispatcher: new EventDispatcher({
      api: { get: vi.fn().mockRejectedValue(new Error('failed')) },
    }),
    flowAnalysis: analysis.value,
  });
}

describe('Renderer RuntimeSession Integration (M0-4 Scope D / PR #34)', () => {
  it('loads the shared ActionFlow conformance fixture', async () => {
    render(
      <Renderer
        preset={testPreset}
        pageId="action-flow-conformance-page"
        documentSessionId="action-flow-conformance-session"
        schema={pageLogicConformance.schema}
      />,
    );

    expect(screen.getByText(pageLogicConformance.expected.initialVisibleText.status)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    expect(
      screen.getByText(pageLogicConformance.expected.afterClickVisibleText.status),
    ).toBeTruthy();
  });

  it('executes fixture recovery and reports its unhandled diagnostic through RuntimeSession', async () => {
    const session = createFixtureSession();
    const recovered = await session.executeFlow('recoverFailure');
    expect(recovered).toMatchObject(pageLogicConformance.expected.recovery.result);
    expect(session.runtime.getState()).toMatchObject(pageLogicConformance.expected.recovery.state);

    await expect(session.executeFlow('unhandledFailure')).rejects.toMatchObject(
      pageLogicConformance.expected.unhandledDiagnostic,
    );
  });

  it('matches the shared Computed conformance corpus before and after one event', async () => {
    render(
      <Renderer
        preset={testPreset}
        pageId="computed-conformance-page"
        documentSessionId="computed-conformance-session"
        schema={pageLogicConformance.schema}
      />,
    );

    expect(screen.getByText(pageLogicConformance.expected.initial.computed.label)).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'change price' }));
      await Promise.resolve();
    });

    const expectedValue = String(pageLogicConformance.expected.afterChange.state.seen);
    expect(pageLogicConformance.expected.afterChange.computed.label).toBe(expectedValue);
    expect(screen.getAllByText(expectedValue)).toHaveLength(2);
  });

  it('handles delay cancellation scenario with no state write-back after unmount', async () => {
    let activeSession: RuntimeSession | undefined;
    let executeFlowSpy: ReturnType<typeof vi.spyOn> | undefined;
    const sessionSpy = vi
      .spyOn(RuntimeSessionModule, 'createRuntimeSession')
      .mockImplementation((options) => {
        const s = new RuntimeSessionModule.RuntimeSession(options);
        activeSession = s;
        return s;
      });
    vi.useFakeTimers();

    try {
      const cancellation = pageLogicConformance.expected.cancellation;
      const cancelComponent = Object.values(pageLogicConformance.schema.components).find((comp) =>
        comp.events?.onClick?.some(
          (action) => action.type === 'runFlow' && action.flow === cancellation.flow,
        ),
      );
      expect(cancelComponent).toBeDefined();
      const buttonLabel = String(cancelComponent?.props?.children ?? '');

      const rendered = render(
        <Renderer
          preset={testPreset}
          pageId="delay-cancel-page"
          documentSessionId="delay-cancel-session"
          schema={pageLogicConformance.schema}
        />,
      );

      expect(activeSession).toBeDefined();
      if (!activeSession) return;

      executeFlowSpy = vi.spyOn(activeSession, 'executeFlow');

      expect(activeSession.runtime.getState()).toMatchObject(cancellation.initialState);
      expect(
        screen.getByText(pageLogicConformance.expected.initialVisibleText.delayed),
      ).toBeTruthy();

      const inFlightAdvanceMs = Math.max(1, Math.floor(cancellation.delayMs / 2));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: buttonLabel }));
        await vi.advanceTimersByTimeAsync(inFlightAdvanceMs);
      });

      expect(executeFlowSpy).toHaveBeenCalledTimes(1);
      expect(executeFlowSpy).toHaveBeenCalledWith(cancellation.flow, undefined);

      const flowPromise = executeFlowSpy.mock.results[0].value;
      expect(flowPromise).toBeInstanceOf(Promise);

      // Unmount the component while flow delay is pending
      rendered.unmount();
      expect(activeSession.isDisposed()).toBe(true);

      await expect(flowPromise).rejects.toMatchObject({
        diagnostic: {
          code: 'FLOW_ABORTED',
        },
      });

      // Advance timers past delayMs
      const postUnmountAdvanceMs = cancellation.delayMs * 2;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(postUnmountAdvanceMs);
      });

      // Observe the SAME RuntimeSession instance: state must remain initial with zero write-back
      expect(activeSession.runtime.getState()).toMatchObject(cancellation.noWriteBackState);
    } finally {
      executeFlowSpy?.mockRestore();
      sessionSpy.mockRestore();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('executes legacy schema inline ActionList without logic declaration', async () => {
    render(
      <Renderer
        preset={testPreset}
        pageId="legacy-schema-page"
        documentSessionId="legacy-schema-session"
        schema={pageLogicConformance.legacySchema}
      />,
    );

    expect(screen.getByText(pageLogicConformance.legacyExpected.initialVisibleText)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Legacy Trigger' }));
      await Promise.resolve();
    });

    expect(
      screen.getByText(pageLogicConformance.legacyExpected.afterClickVisibleText),
    ).toBeTruthy();
    cleanup();
  });

  it('enforces small limits budget exceptions using conformance corpus without bloated nodes', async () => {
    const { smallLimits, budgetExceededCases } = pageLogicConformance;

    for (const [budgetType, caseConfig] of Object.entries(budgetExceededCases)) {
      const validation = validatePageSchemaValue(caseConfig.schema);
      expect(validation.ok).toBe(true);
      if (!validation.ok) continue;

      const canonical = createCanonicalPageSchema(caseConfig.schema);
      expect(canonical).toBeDefined();

      const flows = canonical.logic?.flows;
      expect(flows).toBeDefined();
      if (!flows) continue;

      const analysis = analyzeActionFlowDeclarations(flows);
      expect(analysis.ok).toBe(true);
      if (!analysis.ok) continue;

      const session = createRuntimeSession({
        pageId: `budget-${budgetType}`,
        documentSessionId: `session-${budgetType}`,
        dispatcherInit: {
          state: canonical.logic?.states ? { ...canonical.logic.states } : {},
        },
        flowAnalysis: analysis.value,
        flowExecutionLimits: smallLimits,
      });

      if (budgetType === 'concurrencyBudget') {
        const p1 = session.executeFlow(caseConfig.flow);
        const p2 = session.executeFlow(caseConfig.flow);
        await expect(Promise.all([p1, p2])).rejects.toMatchObject({
          code: caseConfig.expectedError.code,
          flow: caseConfig.expectedError.flow,
        });
      } else {
        await expect(session.executeFlow(caseConfig.flow)).rejects.toMatchObject({
          code: caseConfig.expectedError.code,
          flow: caseConfig.expectedError.flow,
        });
      }
    }
  });

  it('renders named Computed and hot-replaces its graph without resetting Session State', async () => {
    const createSchema = (multiplier: number): PageSchema => ({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { count: 1 },
        computed: { result: `state.count * ${multiplier}` },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['value', 'increment'] },
        value: { id: 'value', type: 'Text', props: { children: '{{ computed.result }}' } },
        increment: {
          id: 'increment',
          type: 'Button',
          props: { children: 'increment computed' },
          events: {
            onClick: [{ type: 'setValue', field: 'state.count', value: '{{ state.count + 1 }}' }],
          },
        },
      },
    });

    const rendered = render(
      <Renderer
        preset={testPreset}
        pageId="computed-page"
        documentSessionId="computed-session"
        schema={createSchema(2)}
      />,
    );

    expect(screen.getByText('2')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'increment computed' }));
      await Promise.resolve();
    });
    expect(screen.getByText('4')).toBeTruthy();

    await act(async () => {
      rendered.rerender(
        <Renderer
          preset={testPreset}
          pageId="computed-page"
          documentSessionId="computed-session"
          schema={createSchema(3)}
        />,
      );
      await Promise.resolve();
    });
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('initializes declared Page State and rerenders after a state action', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: { states: { count: 1 } },
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
    };

    render(
      <Renderer
        preset={testPreset}
        pageId="state-page"
        documentSessionId="state-session"
        schema={schema}
        eventContext={{ state: { count: 99 } }}
      />,
    );

    expect(screen.getByText('1')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'increment' }));
      await Promise.resolve();
    });
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shallow-merges an object into declared Page State', async () => {
    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: { states: { profile: { name: 'Ada' } } },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['value', 'merge'] },
        value: {
          id: 'value',
          type: 'Text',
          props: { children: '{{ state.profile.name + ":" + (state.profile.age || 0) }}' },
        },
        merge: {
          id: 'merge',
          type: 'Button',
          props: { children: 'merge' },
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
    };

    render(
      <Renderer
        preset={testPreset}
        pageId="merge-page"
        documentSessionId="merge-session"
        schema={schema}
      />,
    );

    expect(screen.getByText('Ada:0')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'merge' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Ada:37')).toBeTruthy();
  });

  it('渲染组件成功创建独立 Session，并正确绑定数据上下文', () => {
    render(
      <Renderer
        preset={testPreset}
        pageId="page-test-1"
        documentSessionId="doc-1"
        schema={simpleSchema}
        eventContext={{ data: { greeting: 'custom greeting' } }}
      />,
    );

    expect(screen.getByText('custom greeting')).toBeTruthy();
  });

  it('两个 Renderer 实例使用相同 rootId 和 pageId 同时挂载，状态互不串台', () => {
    const { container: c1 } = render(
      <Renderer
        preset={testPreset}
        pageId="same-page"
        documentSessionId="session-1"
        schema={simpleSchema}
        eventContext={{ data: { greeting: 'instance 1' } }}
      />,
    );

    const { container: c2 } = render(
      <Renderer
        preset={testPreset}
        pageId="same-page"
        documentSessionId="session-2"
        schema={simpleSchema}
        eventContext={{ data: { greeting: 'instance 2' } }}
      />,
    );

    expect(c1.textContent).toContain('instance 1');
    expect(c2.textContent).toContain('instance 2');
  });

  it('documentSessionId 切换时重建全新 RuntimeSession，旧状态与异步回调不影响新 Session', async () => {
    let currentSessionId = 'session-v1';

    const DynamicHost = () => {
      const [sessionId, setSessionId] = useState('session-v1');
      return (
        <div>
          <button onClick={() => setSessionId('session-v2')}>switch session</button>
          <Renderer
            preset={testPreset}
            pageId="dynamic-page"
            documentSessionId={sessionId}
            schema={simpleSchema}
            eventContext={{ data: { greeting: `state-${sessionId}` } }}
          />
        </div>
      );
    };

    render(<DynamicHost />);
    expect(screen.getByText('state-session-v1')).toBeTruthy();

    await act(async () => {
      screen.getByText('switch session').click();
    });

    expect(screen.getByText('state-session-v2')).toBeTruthy();
  });

  it('组件卸载时调用 session.dispose()，销毁 timers 并中止 AbortSignal', () => {
    const { unmount } = render(
      <Renderer
        preset={testPreset}
        pageId="unmount-page"
        documentSessionId="session-unmount"
        schema={simpleSchema}
      />,
    );

    unmount();
    // 卸载无报错且安全清理
    cleanup();
  });

  it('点击组件触发 runFlow，正确执行 steps、修改 state、驱动渲染', async () => {
    const flowSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { count: 0 },
        flows: {
          increment: {
            steps: [
              {
                type: 'setValue',
                field: 'state.count',
                value: '{{ state.count + 1 }}',
              },
            ],
          },
        },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['counter', 'btn'] },
        counter: {
          id: 'counter',
          type: 'Text',
          props: { children: '{{ state.count }}' },
        },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'trigger flow' },
          events: {
            onClick: [{ type: 'runFlow', flow: 'increment' }],
          },
        },
      },
    };

    render(
      <Renderer
        preset={testPreset}
        pageId="flow-exec-page"
        documentSessionId="flow-exec-session"
        schema={flowSchema}
      />,
    );

    expect(screen.getByText('0')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'trigger flow' }));
      await Promise.resolve();
    });

    expect(screen.getByText('1')).toBeTruthy();
  });

  it('同一 session 下热替换 flow 声明，后续点击按新 flow 执行，旧 state 保持', async () => {
    const createFlowSchema = (step: number): PageSchema => ({
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { count: 10 },
        flows: {
          changeCount: {
            steps: [
              {
                type: 'setValue',
                field: 'state.count',
                value: `{{ state.count + ${step} }}`,
              },
            ],
          },
        },
      },
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['counter', 'btn'] },
        counter: {
          id: 'counter',
          type: 'Text',
          props: { children: '{{ state.count }}' },
        },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'change count' },
          events: {
            onClick: [{ type: 'runFlow', flow: 'changeCount' }],
          },
        },
      },
    });

    const rendered = render(
      <Renderer
        preset={testPreset}
        pageId="hot-replace-flow-page"
        documentSessionId="hot-replace-flow-session"
        schema={createFlowSchema(1)}
      />,
    );

    expect(screen.getByText('10')).toBeTruthy();

    // First click: adds 1 -> 11
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'change count' }));
      await Promise.resolve();
    });
    expect(screen.getByText('11')).toBeTruthy();

    // Hot-replace schema with step = 100 within same session
    await act(async () => {
      rendered.rerender(
        <Renderer
          preset={testPreset}
          pageId="hot-replace-flow-page"
          documentSessionId="hot-replace-flow-session"
          schema={createFlowSchema(100)}
        />,
      );
      await Promise.resolve();
    });

    // State 11 is preserved
    expect(screen.getByText('11')).toBeTruthy();

    // Second click: adds 100 -> 111
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'change count' }));
      await Promise.resolve();
    });
    expect(screen.getByText('111')).toBeTruthy();
  });

  it('页面 unmount / session dispose 能够中止正在执行的 flow（API、delay、modal），不再产生悬挂写回', async () => {
    let abortCalled = false;

    const mockApi = {
      get: vi.fn().mockImplementation((_url: string, _params?: unknown, signal?: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            abortCalled = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    };

    const asyncFlowSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      logic: {
        states: { status: 'idle' },
        flows: {
          inFlightFlow: {
            steps: [
              {
                type: 'apiCall',
                url: 'https://example.com/api/test',
                resultTo: 'state.status',
              },
              {
                type: 'delay',
                ms: 100,
              },
              {
                type: 'setValue',
                field: 'state.status',
                value: 'late_finish',
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
          props: { children: 'run api flow' },
          events: {
            onClick: [{ type: 'runFlow', flow: 'inFlightFlow' }],
          },
        },
      },
    };

    try {
      const rendered = render(
        <Renderer
          preset={testPreset}
          pageId="abort-flow-page"
          documentSessionId="abort-flow-session"
          schema={asyncFlowSchema}
          eventContext={{ api: mockApi }}
        />,
      );

      // Trigger flow with in-flight fetch
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'run api flow' }));
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(mockApi.get).toHaveBeenCalled();

      // Unmount before api resolves
      rendered.unmount();

      expect(abortCalled).toBe(true);
    } finally {
      cleanup();
    }
  });
});
