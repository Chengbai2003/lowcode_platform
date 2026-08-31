import { describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { createRendererHost } from '../createRendererHost';
import { testPreset } from '../../__tests__/fixtures/testPreset';

const schemaWithRootType = (type: string) => ({
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: { id: 'root', type, childrenIds: [] },
  },
});

describe('createRendererHost (最小 React Host)', () => {
  it('挂载、update 与 unmount 完整管理 React root 生命周期', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    let host: ReturnType<typeof createRendererHost>;
    act(() => {
      host = createRendererHost(container, {
        preset: testPreset,
        pageId: 'host-page',
        documentSessionId: 'host-session-1',
        schema: schemaWithRootType('Page'),
      });
    });
    expect(container.children.length).toBe(1);

    act(() => {
      host.update({
        preset: testPreset,
        pageId: 'host-page',
        documentSessionId: 'host-session-2',
        schema: schemaWithRootType('Div'),
      });
    });
    expect(container.children.length).toBe(1);

    act(() => {
      host.unmount();
    });
    expect(container.children.length).toBe(0);

    cleanup();
  });
});
