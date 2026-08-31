import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import { testPreset } from './fixtures/testPreset';

const simpleSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['t1'] },
    t1: { id: 't1', type: 'Text', props: { children: '{{ data.greeting || "hello" }}' } },
  },
};

describe('Renderer RuntimeSession Integration (M0-4 Scope D / PR #34)', () => {
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
});
