/**
 * B4 第二个 Preset 真实预览链（Issue #39 / M1F-2 B4，review Spec#5）。
 *
 * 与 b4-frontend-second-preset.test.tsx 不同：本文件不 mock PreviewPane /
 * PropertyPanel / EditorHeader，页面经真实编辑器加载后由真实 PreviewPane →
 * SelectableCanvas → Renderer 渲染，直接在实际预览 DOM 上断言
 * data-preset-test 标记与点击行为（eventContext 经编辑器全链注入）。
 * 仅 mock 网络边界（pageSchemaApi）与 antd message，以及与预览链无关的
 * AI 浮岛/组件树。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TEST_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-test';
import { useEditorStore, useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';

const { messageMock, pageSchemaApiMock } = vi.hoisted(() => ({
  messageMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  pageSchemaApiMock: {
    getPageSchema: vi.fn(),
    savePageSchema: vi.fn(),
  },
}));

beforeEach(() => {
  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  vi.clearAllMocks();
  useEditorStore.getState().clearForPage(null);
  useSelectionStore.getState().clearSelection();
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock('antd', async () => {
  const actual = (await vi.importActual('antd')) as Record<string, unknown>;
  return {
    ...actual,
    message: messageMock,
  };
});

vi.mock('../services/pageSchemaApi', () => ({
  pageSchemaApi: pageSchemaApiMock,
}));

vi.mock('../components/ai-assistant/FloatingIsland', () => ({
  FloatingIsland: () => <div data-testid="mock-floating-island">FloatingIsland</div>,
}));

vi.mock('../components/TreeView/ComponentTree', () => ({
  ComponentTree: () => <div data-testid="mock-component-tree">ComponentTree</div>,
}));

vi.mock('../services/compilerApi', () => ({
  compileSchema: vi.fn().mockResolvedValue('export default function Page() {}'),
}));

import { LowcodeEditor } from '../LowcodeEditor';

const B4_PREVIEW_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['t1', 'b1'] },
    t1: { id: 't1', type: 'Text', props: { children: '真实预览链页面', size: 'lg' } },
    b1: {
      id: 'b1',
      type: 'Button',
      props: { children: '真实预览按钮', variant: 'solid' },
      events: {
        onClick: [
          {
            type: 'feedback',
            kind: 'message',
            content: 'preset-test 真实预览点击',
            level: 'success',
          },
        ],
      },
    },
  },
};

describe('B4 真实预览链：编辑器 → PreviewPane → Renderer（Issue #39 / review Spec#5）', () => {
  it('真实 PreviewPane 渲染 B DOM 标记，点击经编辑器 eventContext 派发 feedback', async () => {
    pageSchemaApiMock.getPageSchema.mockResolvedValueOnce({
      schema: B4_PREVIEW_SCHEMA,
      pageVersion: 1,
      runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
    });

    const { container } = render(
      <LowcodeEditor
        pageId="page-b4-real-preview"
        eventContext={{ ui: { message: messageMock } }}
      />,
    );

    // 真实 PreviewPane 挂载（未被 mock），实际预览 DOM 输出 data-preset-test 标记
    await waitFor(() => {
      const canvasRoot = container.querySelector('[data-preset-test="container"]');
      expect(canvasRoot).not.toBeNull();
    });

    const text = container.querySelector('[data-preset-test="text"]')!;
    expect(text.textContent).toBe('真实预览链页面');
    expect(text.getAttribute('data-size')).toBe('lg');

    const button = container.querySelector(
      'button[data-preset-test="button"]',
    ) as HTMLButtonElement;
    expect(button.textContent).toBe('真实预览按钮');
    expect(button.getAttribute('style')).toContain('dashed');
    expect(button.className).not.toMatch(/ant-/);

    // 点击在实际预览 DOM 上发生，eventContext 经 编辑器 → PreviewPane → Renderer 注入
    fireEvent.click(button);
    await waitFor(() => {
      expect(messageMock.success).toHaveBeenCalledWith('preset-test 真实预览点击');
    });

    expect(screen.queryByTestId('page-load-error')).toBeNull();
  });
});
