import { useCallback, useState } from 'react';
import { message } from 'antd';
import type { PageSchema } from '../../types';
import { compileSchema } from '../services/compilerApi';
import { pageSchemaApi } from '../services/pageSchemaApi';
import { useEditorStore } from '../store/editor-store';

interface Params {
  pageId?: string;
  schema: PageSchema;
  pageVersion: number | null;
  setPageVersion: (v: number | null) => void;
  setSchema: (s: React.SetStateAction<PageSchema>) => void;
  setCompiledCode: (c: string | null) => void;
  onError?: (msg: string) => void;
}

export function useEditorActions({
  pageId,
  schema,
  pageVersion,
  setPageVersion,
  setSchema,
  setCompiledCode,
  onError,
}: Params) {
  const [isPageSaving, setIsPageSaving] = useState(false);

  const handleSavePage = useCallback(async () => {
    if (!pageId || isPageSaving) return;
    const requestGeneration = useEditorStore.getState().generation;
    const requestPageId = pageId ?? null;
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
  }, [isPageSaving, pageId, pageVersion, schema, setPageVersion, setSchema]);

  const handleCompile = useCallback(async () => {
    if (!schema) {
      message.warning('Schema 为空，无法编译');
      setCompiledCode(null);
      return;
    }
    const requestGeneration = useEditorStore.getState().generation;
    const requestPageId = pageId ?? null;
    try {
      const code = await compileSchema(schema);
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
  }, [onError, pageId, schema, setCompiledCode]);

  return { handleSavePage, handleCompile, isPageSaving };
}
