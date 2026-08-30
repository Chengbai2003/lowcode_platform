import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEditorStore, useSelectionStore } from './store/editor-store';
import type { A2UISchema } from '../types';
import type { AgentPatchApplyPayload } from './components/ai-assistant/types/ai-types';

// hoisted mocks
const { messageMock, modalMock, pageSchemaApiMock, mockCreatePatchCommand, mockExecute } =
  vi.hoisted(() => ({
    messageMock: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    modalMock: {
      confirm: vi.fn((opts: any) => {
        // auto-resolve if needed
        if (opts?.onOk) opts.onOk();
        return Promise.resolve(true);
      }),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    },
    pageSchemaApiMock: {
      getPageSchema: vi.fn(),
      savePageSchema: vi.fn(),
    },
    mockCreatePatchCommand: vi.fn(),
    mockExecute: vi.fn(),
  }));

// needed for hoisted capture
const captured = vi.hoisted(() => ({ current: null as any }));

vi.mock('antd', async () => {
  const actual: any = await vi.importActual('antd');
  return {
    ...actual,
    message: messageMock,
    // keep actual Modal component, just wrap statics
    Modal: Object.assign((props: any) => actual.Modal(props), {
      ...actual.Modal,
      confirm: modalMock.confirm,
      info: modalMock.info,
      warning: modalMock.warning,
      error: modalMock.error,
      success: modalMock.success,
    }),
  };
});

vi.mock('./services/pageSchemaApi', () => ({
  pageSchemaApi: pageSchemaApiMock,
}));

vi.mock('./hooks/useSchemaHistoryStore', () => ({
  useSchemaHistoryStore: () => ({
    updateSchema: vi.fn(),
    forceUpdateSchema: vi.fn(),
    executeSchemaCommand: mockExecute,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    historySize: 0,
  }),
}));

vi.mock('./components/ai-assistant/FloatingIsland', () => ({
  FloatingIsland: (props: any) => {
    captured.current = props;
    return null;
  },
}));

vi.mock('./components/ai-assistant/HistoryDrawer', () => ({
  HistoryDrawer: () => null,
}));

vi.mock('./components/TreeView/ComponentTree', () => ({
  ComponentTree: () => null,
}));

vi.mock('./components', async () => {
  const actual: any = await vi.importActual('./components');
  return {
    ...actual,
    EditorHeader: () => null,
    PreviewPane: () => null,
    PropertyPanel: () => null,
    ErrorBoundary: ({ children }: any) => children,
    useUndoRedoShortcuts: () => {},
  };
});

vi.mock('./hooks/useFloatingIslandHotkey', () => ({
  useFloatingIslandHotkey: () => {},
}));

vi.mock('./commands/schemaCommands', () => ({
  createPatchCommand: mockCreatePatchCommand,
  createUpdateSchemaCommand: vi.fn(),
}));

// Import after mocks
import { LowcodeEditor } from './LowcodeEditor';

describe('LowcodeEditor handleAIPatchApply payload guard', () => {
  const baseSchema: A2UISchema = {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['button'] },
      button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
    },
  };

  const nextSchema: A2UISchema = {
    ...baseSchema,
    components: {
      ...baseSchema.components,
      button: { ...baseSchema.components.button, props: { children: '新文案' } },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    captured.current = null;
    // reset stores
    useEditorStore.setState({
      currentPageId: null,
      generation: 0,
      documentSessionId: 'test-doc-session',
      schemaRevision: 0,
      currentSessionId: null,
      sessions: [],
      aiScopeRootId: null,
      aiScopeTargetIds: [],
      aiScopeSourceMessageId: null,
      isHistoryDrawerOpen: false,
      isFloatingIslandOpen: false,
      isLoading: false,
      error: null,
    });
    useSelectionStore.setState({
      selectedId: null,
      hoverId: null,
      selectedIds: [],
      currentPageId: null,
      generation: 0,
      documentSessionId: 'test-doc-session',
    });
    // mock pageSchemaApi to return version 3
    pageSchemaApiMock.getPageSchema.mockResolvedValue({ schema: baseSchema, pageVersion: 3 });
    pageSchemaApiMock.savePageSchema.mockResolvedValue({ pageVersion: 3 });
    mockCreatePatchCommand.mockImplementation(
      (_oldSchema: any, _patch: any, onChange: any, desc: string) => ({
        getNewSchema: () => nextSchema,
        execute: () => onChange(nextSchema),
        description: desc,
      }),
    );
    mockExecute.mockReset();
    messageMock.error.mockReset();
    messageMock.success.mockReset();
  });

  it.each([
    ['pageId', { sourcePageId: 'page-2' }],
    ['basePageVersion', { basePageVersion: 999 }],
    ['generation', { sourceGeneration: 999 }],
    ['documentSessionId', { documentSessionId: 'wrong-session' }],
    ['schemaRevision', { schemaRevision: 999 }],
  ])('blocks mismatched payload: %s', async (_label, override) => {
    const { unmount } = render(
      <LowcodeEditor pageId="page-1" projectName="test" initialSchema={baseSchema} />,
    );

    // allow effects to settle (pageSchemaApi + generation bump)
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    // ensure FloatingIsland captured
    expect(captured.current).not.toBeNull();
    const handleAIPatchApply = captured.current.onPatchApply as (
      payload: AgentPatchApplyPayload,
    ) => Promise<A2UISchema | null>;
    expect(typeof handleAIPatchApply).toBe('function');

    const editorState = useEditorStore.getState();
    // pageVersion state after load should be 3 (from mocked api)
    // we can infer expected base versions from store and from initial pageVersion effect
    const basePayload: AgentPatchApplyPayload = {
      instruction: '把按钮改成新文案',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '新文案' } }],
      resolvedSelectedId: 'button',
      warnings: [],
      traceId: 'trace-1',
      sourcePageId: editorState.currentPageId ?? 'page-1',
      basePageVersion: 3,
      sourceGeneration: editorState.generation,
      documentSessionId: editorState.documentSessionId,
      schemaRevision: editorState.schemaRevision,
    };

    const mismatchedPayload = { ...basePayload, ...override };

    let result: A2UISchema | null | undefined;
    await act(async () => {
      result = await handleAIPatchApply(mismatchedPayload);
    });

    expect(result).toBeNull();
    expect(mockCreatePatchCommand).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledTimes(1);
    const errorMsg = messageMock.error.mock.calls[0][0] as string;
    if ((override as { basePageVersion?: number | null }).basePageVersion !== undefined) {
      expect(errorMsg).toContain('页面版本已变化');
    } else {
      expect(errorMsg).toContain('页面已切换');
    }

    unmount();
  });

  it('allows valid payload', async () => {
    const { unmount } = render(
      <LowcodeEditor pageId="page-1" projectName="test" initialSchema={baseSchema} />,
    );

    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    const handleAIPatchApply = captured.current.onPatchApply as (
      payload: AgentPatchApplyPayload,
    ) => Promise<A2UISchema | null>;

    const editorState = useEditorStore.getState();
    const validPayload: AgentPatchApplyPayload = {
      instruction: '把按钮改成新文案',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '新文案' } }],
      resolvedSelectedId: 'button',
      warnings: [],
      traceId: 'trace-1',
      sourcePageId: editorState.currentPageId ?? 'page-1',
      basePageVersion: 3,
      sourceGeneration: editorState.generation,
      documentSessionId: editorState.documentSessionId,
      schemaRevision: editorState.schemaRevision,
    };

    let result: A2UISchema | null | undefined;
    await act(async () => {
      result = await handleAIPatchApply(validPayload);
    });

    expect(result).toEqual(nextSchema);
    expect(mockCreatePatchCommand).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('blocks when basePageVersion is null vs mismatch still blocked via generation etc, but null version is allowed', async () => {
    // Strict version equality: null payload vs version 3 should be rejected (only null/null allows)
    const { unmount } = render(
      <LowcodeEditor pageId="page-1" projectName="test" initialSchema={baseSchema} />,
    );

    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    const handleAIPatchApply = captured.current.onPatchApply as (
      payload: AgentPatchApplyPayload,
    ) => Promise<A2UISchema | null>;

    const editorState = useEditorStore.getState();
    const payloadWithNullVersion: AgentPatchApplyPayload = {
      instruction: 'test',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: 'x' } }],
      warnings: [],
      traceId: 't',
      sourcePageId: editorState.currentPageId ?? 'page-1',
      basePageVersion: null,
      sourceGeneration: editorState.generation,
      documentSessionId: editorState.documentSessionId,
      schemaRevision: editorState.schemaRevision,
    };

    let result: A2UISchema | null | undefined;
    await act(async () => {
      result = await handleAIPatchApply(payloadWithNullVersion);
    });

    // null vs 3 should be rejected under strict equality (null/null would be allowed for local page)
    expect(result).toBeNull();
    expect(mockCreatePatchCommand).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith(expect.stringContaining('页面版本已变化'));

    unmount();
  });
});
