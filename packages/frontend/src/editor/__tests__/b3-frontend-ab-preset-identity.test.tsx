import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RENDERER_VERSION } from '@lowcode-platform/renderer';
import { antdPreset } from '@lowcode-platform/preset-antd';
import { useEditorStore, useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';
import {
  abTestCompatA,
  abTestCompatB,
  abTestPresetA,
  abTestPresetB,
} from './fixtures/ab-test-presets';

interface CapturedPreviewPaneProps {
  preset: import('@lowcode-platform/renderer').ComponentPreset;
  schema: PageSchema;
  allComponents?: Record<string, unknown>;
  [key: string]: unknown;
}

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
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  capturedProps.previewPane = null;
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

// 真实 RendererPresetCatalog 类 + 测试 A/B 资产，替换 bootstrap 单例导出
vi.mock('../../renderer-preset-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../renderer-preset-catalog')>();
  const fixtures = await import('./fixtures/ab-test-presets');
  const catalog = new actual.RendererPresetCatalog([
    { preset: antdPreset, rendererVersion: RENDERER_VERSION, status: 'active' },
    { preset: fixtures.abTestPresetA, rendererVersion: RENDERER_VERSION, status: 'active' },
    { preset: fixtures.abTestPresetB, rendererVersion: RENDERER_VERSION, status: 'active' },
  ]);
  return {
    ...actual,
    BUILTIN_RENDERER_PRESET_CATALOG: catalog,
  };
});

vi.mock('../components', async () => {
  const actual = (await vi.importActual('../components')) as Record<string, unknown>;
  return {
    ...actual,
    PreviewPane: (props: Record<string, unknown>) => {
      capturedProps.previewPane = props as unknown as CapturedPreviewPaneProps;
      return <div data-testid="mock-preview-pane">PreviewPane Mounted</div>;
    },
    EditorHeader: () => <div data-testid="mock-editor-header" />,
    PropertyPanel: () => <div data-testid="mock-property-panel" />,
  };
});

vi.mock('../components/ai-assistant/FloatingIsland', () => ({
  FloatingIsland: () => <div data-testid="mock-floating-island" />,
}));

vi.mock('../components/TreeView/ComponentTree', () => ({
  ComponentTree: () => <div data-testid="mock-component-tree" />,
}));

vi.mock('../services/compilerApi', () => ({
  compileSchema: vi.fn().mockResolvedValue('export default function Page() {}'),
}));

import { BUILTIN_RENDERER_PRESET_CATALOG } from '../../renderer-preset-catalog';
import { LowcodeEditor } from '../LowcodeEditor';

const SCHEMA_A: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['btn-1'] },
    'btn-1': { id: 'btn-1', type: 'Button', props: { children: 'A' } },
  },
};

const SCHEMA_B: PageSchema = {
  schemaVersion: 0,
  rootId: 'root-b',
  components: {
    'root-b': { id: 'root-b', type: 'Page', childrenIds: ['btn-b'] },
    'btn-b': { id: 'btn-b', type: 'Button', props: { children: 'B' } },
  },
};

describe('B3 Frontend A/B Preset implementation identity', () => {
  it('resolves sealed A/B assets through the real RendererPresetCatalog and mounts distinct same-key implementations', async () => {
    // 真实 Catalog 精确解析（非 mock resolve）
    expect(BUILTIN_RENDERER_PRESET_CATALOG.resolve(abTestCompatA)).toBe(abTestPresetA);
    expect(BUILTIN_RENDERER_PRESET_CATALOG.resolve(abTestCompatB)).toBe(abTestPresetB);
    expect(() =>
      BUILTIN_RENDERER_PRESET_CATALOG.resolve({
        componentPresetId: 'unknown',
        componentPresetVersion: '0.0.0',
        rendererVersion: RENDERER_VERSION,
      }),
    ).toThrow(/Unsupported runtimeCompatibility/);

    pageSchemaApiMock.getPageSchema.mockImplementation((id: string) => {
      if (id === 'page-a') {
        return Promise.resolve({
          schema: SCHEMA_A,
          pageVersion: 1,
          runtimeCompatibility: abTestCompatA,
        });
      }
      if (id === 'page-b') {
        return Promise.resolve({
          schema: SCHEMA_B,
          pageVersion: 2,
          runtimeCompatibility: abTestCompatB,
        });
      }
      return Promise.reject(new Error('unknown page'));
    });

    const { rerender } = render(<LowcodeEditor pageId="page-a" />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      expect(capturedProps.previewPane!.preset).toBe(abTestPresetA);
    });

    expect(capturedProps.previewPane!.preset.runtime.Button).toBe(abTestPresetA.runtime.Button);
    expect(capturedProps.previewPane!.preset.runtime.Button).not.toBe(abTestPresetB.runtime.Button);
    expect(capturedProps.previewPane!.allComponents!.Button).toBe(abTestPresetA.runtime.Button);
    expect(capturedProps.previewPane!.schema.rootId).toBe('root');

    rerender(<LowcodeEditor pageId="page-b" />);

    await waitFor(() => {
      expect(capturedProps.previewPane!.preset).toBe(abTestPresetB);
      expect(capturedProps.previewPane!.schema.rootId).toBe('root-b');
    });

    expect(capturedProps.previewPane!.preset.runtime.Button).toBe(abTestPresetB.runtime.Button);
    expect(capturedProps.previewPane!.preset.runtime.Button).not.toBe(abTestPresetA.runtime.Button);
    expect(capturedProps.previewPane!.allComponents!.Button).toBe(abTestPresetB.runtime.Button);
  });
});
