import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { usePageLifecycle } from '../usePageLifecycle';
import { useEditorActions } from '../useEditorActions';
import { useEditorStore } from '../../store/editor-store';
import { pageSchemaApi } from '../../services/pageSchemaApi';
import type { DataSourcePreviewBinding } from '../../services/dataSourceHostApi';

/**
 * D8（M1b-1 PR D / 计划 §3.1）：绑定四元组 {pageId,pageVersion,schemaRevision,generation}
 * 只在「加载成功/保存成功」铸造；保存失败/409/进行中不铸造；保存期间继续编辑
 * → 铸造的修订号即刻过期（脏）；切页（generation 变化）使旧绑定失效。
 */

vi.mock('antd', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const RUNTIME_COMPATIBILITY = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
};

const BASE_SCHEMA: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
};

describe('usePageLifecycle 绑定铸造（D8）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('加载成功 → 以 {pageId, pageVersion, schemaRevision, generation} 铸造绑定', async () => {
    const getPageSpy = vi.spyOn(pageSchemaApi, 'getPageSchema').mockResolvedValue({
      pageId: 'p1',
      pageVersion: 1,
      snapshotId: 's-1',
      savedAt: '2026-09-21T00:00:00.000Z',
      runtimeCompatibility: RUNTIME_COMPATIBILITY,
      schema: JSON.parse(JSON.stringify(BASE_SCHEMA)),
    } as never);

    const onSnapshotBound = vi.fn();
    const setSchema = vi.fn();
    const setPageVersion = vi.fn();
    renderHook(() =>
      usePageLifecycle({
        pageId: 'p1',
        initialSchemaObj: JSON.parse(JSON.stringify(BASE_SCHEMA)),
        setSchema: setSchema as unknown as React.Dispatch<React.SetStateAction<PageSchema>>,
        setPageVersion,
        setPreset: undefined,
        setPageLoadError: undefined,
        onErrorRef: { current: undefined },
        onSnapshotBound,
      }),
    );

    await waitFor(() => expect(onSnapshotBound).toHaveBeenCalledTimes(1));
    expect(getPageSpy).toHaveBeenCalledWith('p1');
    const snapshot = onSnapshotBound.mock.calls[0][0] as DataSourcePreviewBinding;
    const store = useEditorStore.getState();
    expect(snapshot).toEqual({
      pageId: 'p1',
      pageVersion: 1,
      schemaRevision: store.schemaRevision,
      generation: store.generation,
    });
  });

  it('加载失败 → 不铸造绑定', async () => {
    vi.spyOn(pageSchemaApi, 'getPageSchema').mockRejectedValue(new Error('boom') as never);
    const onSnapshotBound = vi.fn();
    renderHook(() =>
      usePageLifecycle({
        pageId: 'p1',
        initialSchemaObj: JSON.parse(JSON.stringify(BASE_SCHEMA)),
        setSchema: vi.fn() as unknown as React.Dispatch<React.SetStateAction<PageSchema>>,
        setPageVersion: vi.fn(),
        setPreset: undefined,
        setPageLoadError: undefined,
        onErrorRef: { current: undefined },
        onSnapshotBound,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onSnapshotBound).not.toHaveBeenCalled();
  });
});

describe('useEditorActions 保存铸造（D8）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderActions(onPageSaved: Mock) {
    return renderHook(() =>
      useEditorActions({
        pageId: 'p1',
        schema: JSON.parse(JSON.stringify(BASE_SCHEMA)),
        pageVersion: 1,
        setPageVersion: vi.fn(),
        setSchema: vi.fn(),
        setCompiledCode: vi.fn(),
        onPageSaved,
      }),
    );
  }

  it('保存成功 → 以「本次 PUT 携带 schema 的修订号」铸造（保存期间无编辑时即当前修订）', async () => {
    const saveSpy = vi
      .spyOn(pageSchemaApi, 'savePageSchema')
      .mockResolvedValue({ pageId: 'p1', pageVersion: 2, snapshotId: 's2', savedAt: 't' } as never);
    const onPageSaved = vi.fn();
    const revisionBefore = useEditorStore.getState().schemaRevision;

    const { result } = renderActions(onPageSaved);
    await act(async () => {
      await result.current.handleSavePage();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(onPageSaved).toHaveBeenCalledTimes(1);
    expect(onPageSaved.mock.calls[0][0]).toEqual({
      pageId: 'p1',
      pageVersion: 2,
      schemaRevision: revisionBefore,
      generation: useEditorStore.getState().generation,
    });
  });

  it('保存期间继续编辑 → 铸造修订号为保存开始时的值（绑定即刻为脏，不误放行）', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    vi.spyOn(pageSchemaApi, 'savePageSchema').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }) as never,
    );
    const onPageSaved = vi.fn();
    const revisionAtSave = useEditorStore.getState().schemaRevision;

    const { result } = renderActions(onPageSaved);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.handleSavePage();
    });
    // 保存进行中：继续编辑（修订号 +1）
    act(() => {
      useEditorStore.getState().bumpSchemaRevision();
    });
    await act(async () => {
      resolveSave({ pageId: 'p1', pageVersion: 2, snapshotId: 's2', savedAt: 't' });
      await pending;
    });

    expect(onPageSaved).toHaveBeenCalledTimes(1);
    const minted = onPageSaved.mock.calls[0][0] as DataSourcePreviewBinding;
    expect(minted.schemaRevision).toBe(revisionAtSave);
    expect(useEditorStore.getState().schemaRevision).toBe(revisionAtSave + 1);
    // 适配器视角：current(revision) !== bound.schemaRevision → 脏页 fail-close
    expect(useEditorStore.getState().schemaRevision).not.toBe(minted.schemaRevision);
  });

  it('保存失败/409 → 不铸造绑定（旧绑定保留，页面因修订超前而为脏）', async () => {
    const error = new Error('Request failed with status code 409') as Error & { status?: number };
    error.status = 409;
    vi.spyOn(pageSchemaApi, 'savePageSchema').mockRejectedValue(error as never);
    const onPageSaved = vi.fn();

    const { result } = renderActions(onPageSaved);
    await act(async () => {
      await result.current.handleSavePage();
    });

    expect(onPageSaved).not.toHaveBeenCalled();
  });
});
