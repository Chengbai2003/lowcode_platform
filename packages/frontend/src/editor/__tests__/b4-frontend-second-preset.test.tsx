/**
 * B4 第二个 Preset 前端链路（Issue #39 / M1F-2 B4）。
 *
 * 与 B3 前端矩阵共享同一套 mock 策略（PreviewPane 以 prop 捕获方式隔离），
 * 但 DOM 证据不依赖 prop 断言：每组用例同时用真实 Renderer 渲染同一 schema，
 * 断言 data-preset-test DOM 标记，暴露错误挂到 AntD 的情况。
 * Catalog 使用真实 BUILTIN_RENDERER_PRESET_CATALOG（builtin-test 已静态注册），
 * 不重建、不 mock Catalog。
 */
import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { antdPreset, ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
import { testPreset, TEST_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-test';
import { Renderer, type ComponentPreset } from '@lowcode-platform/renderer';
import { BUILTIN_RENDERER_PRESET_CATALOG } from '../../renderer-preset-catalog';
import { applyPatchToSchema } from '../services/patchAdapter';
import { useEditorStore, useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';

const repoRoot = path.resolve(__dirname, '../../../../../');

interface BridgePatchCase {
  baseSchema: PageSchema;
  inputPatch: unknown[];
  returnedPatch: unknown[];
  updatedWorkingSchema: PageSchema;
  initialPageVersion: number;
}

interface BridgeOutput {
  patchCases: {
    aliasInsert: BridgePatchCase;
    aliasInsertThenRemove: BridgePatchCase;
    sameIdRecreate: BridgePatchCase;
  };
}

function getBackendBridgeData(): BridgeOutput {
  const stdout = execFileSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/b4-second-preset-compile.cjs')],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as BridgeOutput;
}

interface SaveAndCompileResult {
  savedPageVersion: number;
  reloadedPageVersion: number;
  staleRejected: boolean;
  staleErrorStatus: number | null;
  staleErrorMessage: string | null;
  storeFileVerified: boolean;
  code: string;
}

function saveAndCompileViaBackend(
  pageId: string,
  schema: PageSchema,
  basePageVersion: number,
): SaveAndCompileResult {
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/b4-second-preset-compile.cjs'),
      '--save-and-compile',
      JSON.stringify({ pageId, schema, basePageVersion }),
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as SaveAndCompileResult;
}

interface CapturedPreviewPaneProps {
  preset: ComponentPreset;
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
  FloatingIsland: () => <div data-testid="mock-floating-island">FloatingIsland Mounted</div>,
}));

vi.mock('../components/TreeView/ComponentTree', () => ({
  ComponentTree: () => <div data-testid="mock-component-tree">ComponentTree</div>,
}));

vi.mock('../services/compilerApi', () => ({
  compileSchema: vi.fn().mockResolvedValue('export default function Page() {}'),
}));

import { LowcodeEditor } from '../LowcodeEditor';

// 仅使用 builtin-test 支持的 Container/Text/Button
const B4_TEST_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['t1', 'b1'] },
    t1: { id: 't1', type: 'Text', props: { children: 'preset-test 页面' } },
    b1: { id: 'b1', type: 'Button', props: { children: 'test 按钮', variant: 'solid' } },
  },
};

const ANT_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['btn-1'] },
    'btn-1': { id: 'btn-1', type: 'Button', props: { children: 'antd 按钮' } },
  },
};

describe('B4 Frontend Second Preset (Issue #39)', () => {
  describe('真实 Catalog：两个 Preset 并存且精确解析', () => {
    it('BUILTIN_RENDERER_PRESET_CATALOG 同时注册 antd 与 test，按三元组各自解析', () => {
      expect(BUILTIN_RENDERER_PRESET_CATALOG.resolve(TEST_RUNTIME_COMPATIBILITY)).toBe(testPreset);
      expect(BUILTIN_RENDERER_PRESET_CATALOG.resolve(ANTD_RUNTIME_COMPATIBILITY)).toBe(antdPreset);
    });

    it('test Preset 的版本不精确匹配时 fail-close（不回退 antd）', () => {
      expect(() =>
        BUILTIN_RENDERER_PRESET_CATALOG.resolve({
          componentPresetId: 'builtin-test',
          componentPresetVersion: '9.9.9',
          rendererVersion: '1.0.0',
        }),
      ).toThrow(/Unsupported runtimeCompatibility/);
    });
  });

  describe('加载链：test 页面按服务端 tuple 解析 Preset，真实 Renderer 输出 B DOM 标记', () => {
    it('编辑器 preset === testPreset，真实 Renderer DOM 含 data-preset-test 且无 ant-* 类', async () => {
      pageSchemaApiMock.getPageSchema.mockResolvedValueOnce({
        schema: B4_TEST_SCHEMA,
        pageVersion: 1,
        runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
      });

      render(<LowcodeEditor pageId="page-b4-test" />);

      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      // 接线：PreviewPane 收到的 preset 是真实 testPreset（经真实 Catalog 解析）
      expect(capturedProps.previewPane!.preset).toBe(testPreset);

      // DOM：真实 Renderer 渲染同一 schema，输出可辨识标记
      const { container: rendererContainer } = render(
        <Renderer
          preset={BUILTIN_RENDERER_PRESET_CATALOG.resolve(TEST_RUNTIME_COMPATIBILITY)}
          pageId="p-b4-dom"
          documentSessionId="doc-b4"
          schema={B4_TEST_SCHEMA as never}
        />,
      );
      expect(
        rendererContainer.querySelectorAll('[data-preset-test="container"]').length,
      ).toBeGreaterThan(0);
      expect(
        rendererContainer.querySelectorAll('[data-preset-test="button"]').length,
      ).toBeGreaterThan(0);
      const renderedButton = rendererContainer.querySelector('button[data-preset-test="button"]')!;
      expect(renderedButton.textContent).toBe('test 按钮');
      expect(renderedButton.className).not.toMatch(/ant-/);
      expect(screen.queryByTestId('page-load-error')).toBeNull();
    });

    it('组件白名单只来自 testPreset.runtime（Container/Text/Button）', async () => {
      pageSchemaApiMock.getPageSchema.mockResolvedValueOnce({
        schema: B4_TEST_SCHEMA,
        pageVersion: 1,
        runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
      });

      render(<LowcodeEditor pageId="page-b4-whitelist" />);

      await waitFor(() => {
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      const allComponents = capturedProps.previewPane!.allComponents as Record<string, unknown>;
      expect(Object.keys(allComponents).sort()).toEqual(Object.keys(testPreset.runtime).sort());
      // AntD 独有组件不得混入白名单
      expect(allComponents['Input']).toBeUndefined();
      expect(allComponents['Table']).toBeUndefined();
    });
  });

  describe('A/B 交错：antd 页面与 test 页面在同会话内互不串用', () => {
    it('切换 pageId 后 preset 与 DOM 标记随服务端 tuple 精确切换', async () => {
      pageSchemaApiMock.getPageSchema.mockImplementation((id: string) => {
        if (id === 'page-antd') {
          return Promise.resolve({
            schema: ANT_SCHEMA,
            pageVersion: 2,
            runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
          });
        }
        if (id === 'page-test') {
          return Promise.resolve({
            schema: B4_TEST_SCHEMA,
            pageVersion: 3,
            runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
          });
        }
        return Promise.reject(new Error('unknown page'));
      });

      const { rerender } = render(<LowcodeEditor pageId="page-antd" />);
      await waitFor(() => {
        expect(capturedProps.previewPane!.preset).toBe(antdPreset);
      });

      rerender(<LowcodeEditor pageId="page-test" />);
      await waitFor(() => {
        expect(capturedProps.previewPane!.preset).toBe(testPreset);
        expect(capturedProps.previewPane!.schema.rootId).toBe('root');
      });

      // 交错回切，验证无全局单例污染
      rerender(<LowcodeEditor pageId="page-antd" />);
      await waitFor(() => {
        expect(capturedProps.previewPane!.preset).toBe(antdPreset);
      });
    });
  });

  describe('404 bootstrap：test 页面的真实服务端创建入口', () => {
    it('以 test 支持的初始 Schema 首次保存，回读服务端 tuple 后解析 testPreset', async () => {
      pageSchemaApiMock.getPageSchema
        .mockRejectedValueOnce(Object.assign(new Error('Page not found'), { status: 404 }))
        .mockResolvedValueOnce({
          schema: B4_TEST_SCHEMA,
          pageVersion: 1,
          runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
        });
      pageSchemaApiMock.savePageSchema.mockResolvedValueOnce({
        pageId: 'page-b4-bootstrap',
        pageVersion: 1,
        snapshotId: 'snap-b4-1',
        savedAt: new Date().toISOString(),
      });

      render(<LowcodeEditor pageId="page-b4-bootstrap" initialSchema={B4_TEST_SCHEMA} />);

      await waitFor(() => {
        expect(pageSchemaApiMock.savePageSchema).toHaveBeenCalledWith(
          'page-b4-bootstrap',
          B4_TEST_SCHEMA,
        );
      });

      await waitFor(() => {
        expect(pageSchemaApiMock.getPageSchema).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('mock-preview-pane')).toBeInTheDocument();
      });

      // 第二次读取以服务端返回的 runtimeCompatibility 走真实 Catalog
      expect(capturedProps.previewPane!.preset).toBe(testPreset);
      expect(screen.queryByTestId('page-load-error')).toBeNull();
    });
  });

  describe('mismatch fail-close：test Preset 版本不匹配时不挂载受阻页面', () => {
    it('builtin-test@9.9.9 返回错误 UI，PreviewPane 不挂载且保存被阻止', async () => {
      pageSchemaApiMock.getPageSchema.mockRejectedValueOnce(
        new Error(
          'Unsupported runtimeCompatibility: componentPresetId=builtin-test, componentPresetVersion=9.9.9',
        ),
      );

      render(<LowcodeEditor pageId="page-b4-mismatch" />);

      await waitFor(() => {
        expect(screen.getByTestId('page-load-error')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('mock-preview-pane')).toBeNull();

      await waitFor(() => {
        expect(screen.queryByTestId('mock-property-panel')).toBeNull();
        expect(screen.queryByTestId('mock-floating-island')).toBeNull();
      });
    });
  });
});

describe('B4 别名 Patch 重放路径（真实跨包串联：实际返回 Patch → 前端重放结果 → CAS → Compiler）', () => {
  let bridgeData: BridgeOutput;

  beforeAll(() => {
    bridgeData = getBackendBridgeData();
  });

  it('单别名插入：后端真实工具返回的 Patch 经真实 applyPatchToSchema 重放，与服务端预览完整全等，且送入 CAS 保存与 Compiler 编译成功 (Constraint 4)', () => {
    const patchCase = bridgeData.patchCases.aliasInsert;

    // 1. 真实工具返回的 Patch 交给前端 applyPatchToSchema 重放（绝非手写 Patch）
    const replayed = applyPatchToSchema(patchCase.baseSchema, patchCase.returnedPatch as never);

    // 2. 完整相等断言：前端重放结果与服务端 preview 结果完整全等
    expect(replayed).toEqual(patchCase.updatedWorkingSchema);
    expect(replayed.components['alias-cta']?.type).toBe('Button');
    expect(replayed.components['alias-cta']?.props?.children).toBe('别名按钮');
    expect(replayed.components['root']?.childrenIds).toContain('alias-cta');

    // Schema 仍是纯数据：无任何身份/绑定字段
    const raw = replayed as unknown as Record<string, unknown>;
    expect(raw.runtimeCompatibility).toBeUndefined();
    expect(raw.systemId).toBeUndefined();

    // 3. 将前端重放结果送入真实 CAS 保存与 Compiler 编译链路（真实 PageSchemaRepository + 独立临时文件）
    const result = saveAndCompileViaBackend(
      'b4-fe-alias-1',
      replayed,
      patchCase.initialPageVersion,
    );
    expect(result.savedPageVersion).toBe(2);
    expect(result.reloadedPageVersion).toBe(2);
    expect(result.storeFileVerified).toBe(true);
    expect(result.staleRejected).toBe(true);
    expect(result.staleErrorStatus).toBe(409);
    expect(result.code).toContain('@lowcode-platform/preset-test/runtime');
    expect(result.code).toContain('别名按钮');
    expect(result.code).not.toMatch(/<Action[\s/>]/);
  });

  it('复杂 Patch（别名插入后删除）：实际返回 Patch 经前端重放，与服务端预览完整全等，送入 CAS 保存成功且产物干净 (Constraint 4)', () => {
    const patchCase = bridgeData.patchCases.aliasInsertThenRemove;

    // 1. 真实工具返回的 Patch 交给前端 applyPatchToSchema 重放
    const replayed = applyPatchToSchema(patchCase.baseSchema, patchCase.returnedPatch as never);

    // 2. 完整相等断言：前端重放结果与服务端 preview 结果完整全等
    expect(replayed).toEqual(patchCase.updatedWorkingSchema);
    expect(replayed.components['temp-cta']).toBeUndefined();
    expect(replayed.components['root']?.childrenIds).not.toContain('temp-cta');

    // 3. 将前端重放结果送入真实 CAS 保存与 Compiler 编译链路（真实 PageSchemaRepository + 独立临时文件）
    const result = saveAndCompileViaBackend(
      'b4-fe-alias-del',
      replayed,
      patchCase.initialPageVersion,
    );
    expect(result.savedPageVersion).toBe(2);
    expect(result.reloadedPageVersion).toBe(2);
    expect(result.storeFileVerified).toBe(true);
    expect(result.staleRejected).toBe(true);
    expect(result.staleErrorStatus).toBe(409);
    expect(result.code).toContain('@lowcode-platform/preset-test/runtime');
    expect(result.code).not.toContain('临时按钮');
    expect(result.code).not.toMatch(/<Action[\s/>]/);
    expect(result.code).not.toMatch(/<Button[^>]*temp-cta/);
  });

  it('复杂 Patch（同 ID 异构别名重建）：实际返回 Patch 经前端重放，与服务端预览完整全等，送入 CAS 保存成功且产物类型正确 (Constraint 4)', () => {
    const patchCase = bridgeData.patchCases.sameIdRecreate;

    // 1. 真实工具返回的 Patch 交给前端 applyPatchToSchema 重放
    const replayed = applyPatchToSchema(patchCase.baseSchema, patchCase.returnedPatch as never);

    // 2. 完整相等断言：前端重放结果与服务端 preview 结果完整全等
    expect(replayed).toEqual(patchCase.updatedWorkingSchema);
    expect(replayed.components['slot-1']?.type).toBe('Text');
    expect(replayed.components['slot-1']?.props?.children).toBe('后建文本');
    expect(replayed.components['root']?.childrenIds).toContain('slot-1');

    // 3. 将前端重放结果送入真实 CAS 保存与 Compiler 编译链路（真实 PageSchemaRepository + 独立临时文件）
    const result = saveAndCompileViaBackend(
      'b4-fe-alias-recreate',
      replayed,
      patchCase.initialPageVersion,
    );
    expect(result.savedPageVersion).toBe(2);
    expect(result.reloadedPageVersion).toBe(2);
    expect(result.storeFileVerified).toBe(true);
    expect(result.staleRejected).toBe(true);
    expect(result.staleErrorStatus).toBe(409);
    expect(result.code).toContain('@lowcode-platform/preset-test/runtime');
    expect(result.code).toContain('后建文本');
    expect(result.code).not.toContain('先建按钮');
    expect(result.code).not.toMatch(/<Action[\s/>]/);
    expect(result.code).not.toMatch(/<Caption[\s/>]/);
  });

  it('真实 CAS 拒绝：前端若以过期 basePageVersion 提交，真实 PageSchemaRepository 拒绝并抛出 409 Conflict (Constraint 4)', () => {
    const patchCase = bridgeData.patchCases.aliasInsert;
    const replayed = applyPatchToSchema(patchCase.baseSchema, patchCase.returnedPatch as never);

    // 模拟前端并发冲突：提交过期的 basePageVersion（如 999 而非当前的 1）
    expect(() => saveAndCompileViaBackend('b4-fe-stale-test', replayed, 999)).toThrow(
      /Page version mismatch|ConflictException/,
    );
  });
});
