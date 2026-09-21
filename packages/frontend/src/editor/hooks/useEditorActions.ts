import { useCallback, useState } from 'react';
import { message } from 'antd';
import type { PageSchema } from '../../types';
import { compileSchema } from '../services/compilerApi';
import { pageSchemaApi } from '../services/pageSchemaApi';
import type { DataSourcePreviewBinding } from '../services/dataSourceHostApi';
import { useEditorStore } from '../store/editor-store';

interface Params {
  pageId?: string;
  schema: PageSchema;
  pageVersion: number | null;
  setPageVersion: (v: number | null) => void;
  setSchema: (s: React.SetStateAction<PageSchema>) => void;
  setCompiledCode: (c: string | null) => void;
  onError?: (msg: string) => void;
  pageLoadError?: string | null;
  /** PR D 数据源预览绑定：保存成功时以「本次 PUT 携带 schema 的修订号」铸造 */
  onPageSaved?: (snapshot: DataSourcePreviewBinding) => void;
}

export function useEditorActions({
  pageId,
  schema,
  pageVersion,
  setPageVersion,
  setSchema,
  onPageSaved,
  setCompiledCode,
  onError,
  pageLoadError,
}: Params) {
  const [isPageSaving, setIsPageSaving] = useState(false);

  const handleSavePage = useCallback(async () => {
    if (!pageId || isPageSaving || Boolean(pageLoadError)) return;
    const requestGeneration = useEditorStore.getState().generation;
    const requestPageId = pageId ?? null;
    // PR D：记录本次 PUT 携带 schema 的修订号——保存期间继续编辑会使当前
    // 修订号超前，铸造出的绑定随即为脏（查询 fail-close），不会错误放行
    const revisionAtSave = useEditorStore.getState().schemaRevision;
    setIsPageSaving(true);
    try {
      const schemaToSave = schema;
      const result = await pageSchemaApi.savePageSchema(
        pageId,
        schemaToSave,
        pageVersion ?? undefined,
      );
      const currentGeneration = useEditorStore.getState().generation;
      const currentPageId = useEditorStore.getState().currentPageId;
      if (currentGeneration !== requestGeneration || currentPageId !== requestPageId) return;
      setPageVersion(result.pageVersion);
      onPageSaved?.({
        pageId,
        pageVersion: result.pageVersion,
        schemaRevision: revisionAtSave,
        generation: requestGeneration,
      });
      // 页面版本保存在独立状态，不再写回 Schema
      setSchema((current) => current as PageSchema);
      message.success(`页面已保存，当前版本 v${result.pageVersion}`);
    } catch (error) {
      const currentGeneration = useEditorStore.getState().generation;
      const currentPageId = useEditorStore.getState().currentPageId;
      if (currentGeneration !== requestGeneration || currentPageId !== requestPageId) return;
      const errorMessage = error instanceof Error ? error.message : '页面保存失败';
      message.error(errorMessage);
    } finally {
      setIsPageSaving(false);
    }
  }, [
    isPageSaving,
    pageId,
    pageLoadError,
    pageVersion,
    schema,
    setPageVersion,
    setSchema,
    onPageSaved,
  ]);

  const handleCompile = useCallback(async () => {
    if (pageLoadError) {
      message.error('当前页面运行时配置存在错误，禁止编译');
      return;
    }
    if (!schema) {
      message.warning('Schema 为空，无法编译');
      setCompiledCode(null);
      return;
    }
    if (!pageId || pageVersion === null) {
      message.warning('请先保存页面后再编译');
      setCompiledCode(null);
      return;
    }
    const requestGeneration = useEditorStore.getState().generation;
    const requestPageId = pageId ?? null;
    try {
      const code = await compileSchema(schema, { pageId, pageVersion });
      const curGen = useEditorStore.getState().generation;
      const curPageId = useEditorStore.getState().currentPageId;
      if (curGen !== requestGeneration || curPageId !== requestPageId) return;
      setCompiledCode(code);
      message.success('编译成功！');
    } catch (e) {
      const curGen = useEditorStore.getState().generation;
      const curPageId = useEditorStore.getState().currentPageId;
      if (curGen !== requestGeneration || curPageId !== requestPageId) return;
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      onError?.(errorMessage);
      message.error('编译失败：' + errorMessage);
      setCompiledCode(null);
    }
  }, [onError, pageId, pageLoadError, pageVersion, schema, setCompiledCode]);

  return { handleSavePage, handleCompile, isPageSaving };
}
