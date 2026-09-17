import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ANTD_RUNTIME_COMPATIBILITY, antdPreset } from '@lowcode-platform/preset-antd';
import type { ComponentPreset } from '@lowcode-platform/renderer';
import { useEditorStore, useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';

interface CapturedPreviewPaneProps {
  preset: ComponentPreset;
  schema: PageSchema;
  [key: string]: unknown;
}

interface CapturedFloatingIslandProps {
  preset?: ComponentPreset;
  [key: string]: unknown;
}

// Hoisted mocks for message and api
const { messageMock, pageSchemaApiMock, capturedProps } = vi.hoisted(() => ({
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
  capturedProps: {
    previewPane: null as CapturedPreviewPaneProps | null,
    floatingIsland: null as CapturedFloatingIslandProps | null,
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
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  capturedProps.previewPane = null;
  capturedProps.floatingIsland = null;
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

vi.mock('../components', async () => {
  const actual = (await vi.importActual('../components')) as Record<string, unknown>;
  return {
    ...actual,
    PreviewPane: (props: Record<string, unknown>) => {
      capturedProps.previewPane = props as unknown as CapturedPreviewPaneProps;
      return <div data-testid="mock-preview-pane">PreviewPane Mounted</div>;
    },
    EditorHeader: (props: { onSave?: () => void; onCompile?: () => void }) => (
      <div data-testid="mock-editor-header">
        <button data-testid="header-save-btn" onClick={props.onSave}>
          Save
        </button>
        <button data-testid="header-compile-btn" onClick={props.onCompile}>
          Compile
        </button>
      </div>
    ),
    PropertyPanel: () => <div data-testid="mock-property-panel">PropertyPanel</div>,
  };
});

vi.mock('../components/ai-assistant/FloatingIsland', () => ({
  FloatingIsland: (props: Record<string, unknown>) => {
    capturedProps.floatingIsland = props as unknown as CapturedFloatingIslandProps;
    return <div data-testid="mock-floating-island">FloatingIsland Mounted</div>;
  },
}));

vi.mock('../components/TreeView/ComponentTree', () => ({
  ComponentTree: () => <div data-testid="mock-component-tree">ComponentTree</div>,
}));

vi.mock('../services/compilerApi', () => ({
  compileSchema: vi.fn().mockResolvedValue('export default function Page() {}'),
}));

import { LowcodeEditor } from '../LowcodeEditor';

const VALID_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['btn-1'] },
    'btn-1': { id: 'btn-1', type: 'Button', props: { children: '测试按钮' } },
  },
};

describe('B3 Frontend Runtime Profile Integration Matrix (Issue #39)', () => {
  describe('Scenario 8: 前端真实加载/Preview 与 Catalog 接线', () => {
    it('loads page, resolves preset via Catalog, and mounts PreviewPane with resolved preset', async () => {
      pageSchemaApiMock.getPageSchema.mockResolvedValueOnce({
        schema: VALID_SCHEMA,
        pageVersion: 1,
        runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
      });

      render(<LowcodeEditor pageId="page-antd" />);

      await waitFor(() => {
        expect(pageSchemaApiMock.getPageSchema).toHaveBeenCalledWith('page-antd');
      });

      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      // 验证 PreviewPane 接收到的 preset 准确对应 antdPreset
      expect(capturedProps.previewPane).not.toBeNull();
      expect(capturedProps.previewPane!.preset).toBe(antdPreset);
      expect(capturedProps.previewPane!.preset.runtime).toBe(antdPreset.runtime);

      // 验证 FloatingIsland 接收到相同的 preset
      expect(capturedProps.floatingIsland).not.toBeNull();
      expect(capturedProps.floatingIsland!.preset).toBe(antdPreset);

      // 错误提示未渲染
      expect(screen.queryByTestId('page-load-error')).toBeNull();
    });
  });

  describe('Scenario 9: 前端 A/B 迟到响应与竞态处理', () => {
    it('preserves Page B state when Page A response arrives late', async () => {
      let resolveA!: (value: unknown) => void;
      const promiseA = new Promise((resolve) => {
        resolveA = resolve;
      });

      const schemaB: PageSchema = {
        schemaVersion: 0,
        rootId: 'root-b',
        components: {
          'root-b': { id: 'root-b', type: 'Page', childrenIds: [] },
        },
      };

      pageSchemaApiMock.getPageSchema.mockImplementation((id: string) => {
        if (id === 'page-a') {
          return promiseA;
        }
        if (id === 'page-b') {
          return Promise.resolve({
            schema: schemaB,
            pageVersion: 2,
            runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
          });
        }
        return Promise.reject(new Error('not found'));
      });

      // 首次加载 page-a
      const { rerender } = render(<LowcodeEditor pageId="page-a" />);

      // 用户迅速切换到 page-b
      rerender(<LowcodeEditor pageId="page-b" />);

      // 等待 page-b 加载完成
      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
        expect(capturedProps.previewPane!.schema.rootId).toBe('root-b');
      });

      // 此时延迟的 page-a 响应终于返回
      await act(async () => {
        resolveA({
          schema: VALID_SCHEMA,
          pageVersion: 1,
          runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
        });
      });

      // 验证：迟到的 page-a 响应不会覆盖 page-b
      expect(capturedProps.previewPane!.schema.rootId).toBe('root-b');
    });
  });

  describe('Scenario 5 (Frontend): disabled / unknown / mismatch 拒绝策略与 Fail-Close', () => {
    it('renders Alert error UI, unmounts PreviewPane/Sidebars, and blocks Save/Compile on unknown runtimeCompatibility', async () => {
      pageSchemaApiMock.getPageSchema.mockRejectedValueOnce(
        new Error(
          'Unsupported renderer runtimeCompatibility: componentPresetId=unknown-preset, componentPresetVersion=9.9.9, rendererVersion=9.9.9',
        ),
      );

      render(<LowcodeEditor pageId="page-unknown" />);

      await waitFor(() => {
        expect(screen.getByTestId('page-load-error')).toBeInTheDocument();
      });

      // 验证错误信息
      const alert = screen.getByTestId('page-load-error');
      expect(alert).toHaveTextContent('页面加载受阻：运行时配置不支持');
      expect(alert).toHaveTextContent('Unsupported renderer runtimeCompatibility');

      // 核心 Fail-Close 保证：PreviewPane、侧边栏、浮动岛均不挂载
      expect(screen.queryByTestId('mock-preview-pane')).toBeNull();
      await waitFor(() => {
        expect(screen.queryByTestId('mock-component-tree')).toBeNull();
        expect(screen.queryByTestId('mock-property-panel')).toBeNull();
        expect(screen.queryByTestId('mock-floating-island')).toBeNull();
      });

      // 点击 Save 按钮应被阻止，不调用 savePageSchema
      const saveBtn = screen.getByTestId('header-save-btn');
      await act(async () => {
        fireEvent.click(saveBtn);
      });
      expect(pageSchemaApiMock.savePageSchema).not.toHaveBeenCalled();

      // 点击 Compile 按钮应被阻止并提示错误
      const compileBtn = screen.getByTestId('header-compile-btn');
      await act(async () => {
        fireEvent.click(compileBtn);
      });
      expect(messageMock.error).toHaveBeenCalledWith('当前页面运行时配置存在错误，禁止编译');
    });
  });

  describe('Scenario 12: 404 初始化后通过服务端绑定解析 Preset', () => {
    it('re-fetches the saved page and mounts PreviewPane with catalog-resolved preset (not hardcoded antdPreset)', async () => {
      pageSchemaApiMock.getPageSchema
        .mockRejectedValueOnce(Object.assign(new Error('Page not found'), { status: 404 }))
        .mockResolvedValueOnce({
          schema: VALID_SCHEMA,
          pageVersion: 1,
          runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
        });
      pageSchemaApiMock.savePageSchema.mockResolvedValueOnce({
        pageId: 'page-bootstrap',
        pageVersion: 1,
        snapshotId: 'snap-1',
        savedAt: new Date().toISOString(),
      });

      render(<LowcodeEditor pageId="page-bootstrap" />);

      await waitFor(() => {
        expect(pageSchemaApiMock.savePageSchema).toHaveBeenCalledWith(
          'page-bootstrap',
          expect.anything(),
        );
      });

      await waitFor(() => {
        expect(pageSchemaApiMock.getPageSchema).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      // 第二次读取使用服务端返回的 runtimeCompatibility 走 Catalog，而不是 setPreset(antdPreset) 硬编码
      expect(pageSchemaApiMock.getPageSchema).toHaveBeenNthCalledWith(2, 'page-bootstrap');
      expect(capturedProps.previewPane!.preset).toBe(antdPreset);
      expect(capturedProps.previewPane!.schema.rootId).toBe('root');
    });
  });

  describe('Scenario 13: 旧页面初始化失败不污染新页面', () => {
    it('does not set pageLoadError for Page B when Page A bootstrap save fails late', async () => {
      let rejectBootstrapA!: (err: unknown) => void;
      const bootstrapPromiseA = new Promise((_, reject) => {
        rejectBootstrapA = reject;
      });

      pageSchemaApiMock.getPageSchema.mockImplementation((id: string) => {
        if (id === 'page-a') {
          return Promise.reject(Object.assign(new Error('Page not found'), { status: 404 }));
        }
        if (id === 'page-b') {
          return Promise.resolve({
            schema: VALID_SCHEMA,
            pageVersion: 3,
            runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
          });
        }
        return Promise.reject(new Error('unknown page'));
      });

      pageSchemaApiMock.savePageSchema.mockImplementation((id: string) => {
        if (id === 'page-a') {
          return bootstrapPromiseA;
        }
        return Promise.resolve({
          pageId: id,
          pageVersion: 1,
          snapshotId: 'snap',
          savedAt: new Date().toISOString(),
        });
      });

      const { rerender } = render(<LowcodeEditor pageId="page-a" />);
      await waitFor(() => {
        expect(pageSchemaApiMock.savePageSchema).toHaveBeenCalledWith('page-a', expect.anything());
      });

      // 切到 page-b 并完成加载
      rerender(<LowcodeEditor pageId="page-b" />);
      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
        expect(capturedProps.previewPane!.schema.rootId).toBe('root');
      });

      // page-a 初始化保存失败迟到返回：不得污染 page-b
      await act(async () => {
        rejectBootstrapA(new Error('bootstrap A failed'));
        await Promise.resolve();
      });

      expect(screen.queryByTestId('page-load-error')).toBeNull();
      expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
    });
  });

  describe('Scenario 14: 组件白名单只使用当前页面 Preset', () => {
    it('passes only editorPreset.runtime keys as PreviewPane allComponents (no global registry merge)', async () => {
      pageSchemaApiMock.getPageSchema.mockResolvedValueOnce({
        schema: VALID_SCHEMA,
        pageVersion: 1,
        runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
      });

      render(<LowcodeEditor pageId="page-whitelist" />);

      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      const allComponents = capturedProps.previewPane!.allComponents as Record<string, unknown>;
      expect(Object.keys(allComponents).sort()).toEqual(Object.keys(antdPreset.runtime).sort());
      // 不允许全局 componentRegistry 中不在 Preset 内的键混入
      for (const key of Object.keys(allComponents)) {
        expect(Object.prototype.hasOwnProperty.call(antdPreset.runtime, key)).toBe(true);
      }
    });
  });
});
