import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createSealedPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { useEditorStore, useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';

interface CapturedPreviewPaneProps {
  preset: ComponentPreset;
  schema: PageSchema;
  allComponents?: Record<string, unknown>;
  [key: string]: unknown;
}

const { messageMock, pageSchemaApiMock, capturedProps, catalogMock } = vi.hoisted(() => ({
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
  catalogMock: {
    resolve: vi.fn(),
  },
}));

function createAbPresets(): {
  presetA: ComponentPreset;
  presetB: ComponentPreset;
  compatA: RuntimeCompatibility;
  compatB: RuntimeCompatibility;
} {
  const ButtonA = ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button data-testid="impl-a" {...props}>
      {children}
    </button>
  );
  ButtonA.displayName = 'ButtonA';
  const ButtonB = ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button data-testid="impl-b" {...props}>
      {children}
    </button>
  );
  ButtonB.displayName = 'ButtonB';
  const Page = ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  );

  const manifest = {
    Page: { componentType: 'Page', allowedProps: ['children', 'style', 'className', 'id'] },
    Button: { componentType: 'Button', allowedProps: ['children', 'style', 'className', 'id'] },
  };

  const presetA = createSealedPreset({
    id: 'test-preset-a',
    version: '1.0.0',
    runtime: { Page, Button: ButtonA },
    manifest,
    compiler: {
      defaultLibrary: 'lib-a',
      componentSources: { Page: 'lib-a/page', Button: 'lib-a/button' },
      allowDefaultComponentFallback: false,
    },
  });

  const presetB = createSealedPreset({
    id: 'test-preset-b',
    version: '2.0.0',
    runtime: { Page, Button: ButtonB },
    manifest,
    compiler: {
      defaultLibrary: 'lib-b',
      componentSources: { Page: 'lib-b/page', Button: 'lib-b/button' },
      allowDefaultComponentFallback: false,
    },
  });

  return {
    presetA,
    presetB,
    compatA: {
      componentPresetId: presetA.id,
      componentPresetVersion: presetA.version,
      rendererVersion: RENDERER_VERSION,
    },
    compatB: {
      componentPresetId: presetB.id,
      componentPresetVersion: presetB.version,
      rendererVersion: RENDERER_VERSION,
    },
  };
}

const ab = createAbPresets();

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

  catalogMock.resolve.mockImplementation((compat: RuntimeCompatibility) => {
    if (
      compat.componentPresetId === ab.presetA.id &&
      compat.componentPresetVersion === ab.presetA.version
    ) {
      return ab.presetA;
    }
    if (
      compat.componentPresetId === ab.presetB.id &&
      compat.componentPresetVersion === ab.presetB.version
    ) {
      return ab.presetB;
    }
    throw new Error(`Unsupported runtimeCompatibility: ${JSON.stringify(compat)}`);
  });
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

vi.mock('../../renderer-preset-catalog', () => ({
  BUILTIN_RENDERER_PRESET_CATALOG: catalogMock,
  RendererPresetCatalog: class {},
}));

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
  it('mounts the exact same-key component implementation from each page profile (not just keys)', async () => {
    pageSchemaApiMock.getPageSchema.mockImplementation((id: string) => {
      if (id === 'page-a') {
        return Promise.resolve({
          schema: SCHEMA_A,
          pageVersion: 1,
          runtimeCompatibility: ab.compatA,
        });
      }
      if (id === 'page-b') {
        return Promise.resolve({
          schema: SCHEMA_B,
          pageVersion: 2,
          runtimeCompatibility: ab.compatB,
        });
      }
      return Promise.reject(new Error('unknown page'));
    });

    const { rerender } = render(<LowcodeEditor pageId="page-a" />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      expect(capturedProps.previewPane!.preset).toBe(ab.presetA);
    });

    // 同名 Button：必须是 A 的实现引用，不是 B，也不是“仅 key 相同”
    expect(capturedProps.previewPane!.preset.runtime.Button).toBe(ab.presetA.runtime.Button);
    expect(capturedProps.previewPane!.preset.runtime.Button).not.toBe(ab.presetB.runtime.Button);
    expect(capturedProps.previewPane!.allComponents!.Button).toBe(ab.presetA.runtime.Button);
    expect(capturedProps.previewPane!.schema.rootId).toBe('root');

    // 切到 page-b：同名 Button 实现必须切换为 B
    rerender(<LowcodeEditor pageId="page-b" />);

    await waitFor(() => {
      expect(capturedProps.previewPane!.preset).toBe(ab.presetB);
      expect(capturedProps.previewPane!.schema.rootId).toBe('root-b');
    });

    expect(capturedProps.previewPane!.preset.runtime.Button).toBe(ab.presetB.runtime.Button);
    expect(capturedProps.previewPane!.preset.runtime.Button).not.toBe(ab.presetA.runtime.Button);
    expect(capturedProps.previewPane!.allComponents!.Button).toBe(ab.presetB.runtime.Button);

    // Catalog 按 tuple 精确解析了两次
    expect(catalogMock.resolve).toHaveBeenCalledWith(ab.compatA);
    expect(catalogMock.resolve).toHaveBeenCalledWith(ab.compatB);
  });
});
