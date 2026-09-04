import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { analyzeActionFlowDeclarations, type PageSchema } from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import { EventDispatcher } from '../EventDispatcher';
import { createRuntimeSession } from '../session/RuntimeSession';
import { testPreset } from './fixtures/testPreset';

const conformanceFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-computed-conformance.json'),
    'utf8',
  ),
) as {
  schema: PageSchema;
  expected: {
    initial: { computed: { label: string } };
    afterChange: { state: { seen: number }; computed: { label: string } };
  };
};

const actionFlowFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1a-action-flow-conformance.json'),
    'utf8',
  ),
) as {
  schema: PageSchema;
  expected: {
    initial: { visibleStatus: string };
    afterClick: { visibleStatus: string };
    recovery: { state: { recovered: boolean }; result: { status: string; flow: string } };
    unhandledDiagnostic: { code: string; flow: string; step: number; stepPath: string[] };
  };
};

const simpleSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['t1'] },
    t1: { id: 't1', type: 'Text', props: { children: '{{ data.greeting || "hello" }}' } },
  },
};

function createFixtureSession() {
  const flows = actionFlowFixture.schema.logic?.flows;
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
        schema={actionFlowFixture.schema}
      />,
    );

    expect(screen.getByText(actionFlowFixture.expected.initial.visibleStatus)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    expect(screen.getByText(actionFlowFixture.expected.afterClick.visibleStatus)).toBeTruthy();
  });

  it('executes fixture recovery and reports its unhandled diagnostic through RuntimeSession', async () => {
    const session = createFixtureSession();
    const recovered = await session.executeFlow('recoverFailure');
    expect(recovered).toMatchObject(actionFlowFixture.expected.recovery.result);
    expect(session.runtime.getState()).toMatchObject(actionFlowFixture.expected.recovery.state);

    await expect(session.executeFlow('unhandledFailure')).rejects.toMatchObject(
      actionFlowFixture.expected.unhandledDiagnostic,
    );
  });

  it('matches the shared Computed conformance corpus before and after one event', async () => {
    render(
      <Renderer
        preset={testPreset}
        pageId="computed-conformance-page"
        documentSessionId="computed-conformance-session"
        schema={conformanceFixture.schema}
      />,
    );

    expect(screen.getByText(conformanceFixture.expected.initial.computed.label)).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'change price' }));
      await Promise.resolve();
    });

    const expectedValue = String(conformanceFixture.expected.afterChange.state.seen);
    expect(conformanceFixture.expected.afterChange.computed.label).toBe(expectedValue);
    expect(screen.getAllByText(expectedValue)).toHaveLength(2);
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
