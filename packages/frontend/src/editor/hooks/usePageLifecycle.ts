import { useEffect, useRef } from 'react';
import { message } from 'antd';
import type { A2UISchema } from '../../types';
import { useEditorStore } from '../store/editor-store';
import { pageSchemaApi } from '../services/pageSchemaApi';

/**
 * Page lifecycle hook — handles initial load, generation guard and 404 bootstrap.
 * Extracted from LowcodeEditorInner to keep the facade thin.
 *
 * 语义变更（Issue #16 / M0-1）：schema 与 pageVersion 内部状态严格分离——
 * Schema 不再回写页面版本，页面版本只保存在独立的 pageVersion 状态中
 * （临时继续读取旧 API envelope 的顶层 version，PR 3 更名为 pageVersion）。
 */
interface Params {
  pageId: string | undefined;
  initialSchemaObj: A2UISchema;
  setSchema: React.Dispatch<React.SetStateAction<A2UISchema>>;
  setPageVersion: (v: number | null) => void;
  onErrorRef: React.MutableRefObject<((msg: string) => void) | undefined>;
}

export function usePageLifecycle({
  pageId,
  initialSchemaObj,
  setSchema,
  setPageVersion,
  onErrorRef,
}: Params) {
  const initialRef = useRef(initialSchemaObj);
  useEffect(() => {
    initialRef.current = initialSchemaObj;
  }, [initialSchemaObj]);

  useEffect(() => {
    let cancelled = false;
    const pageIdParam = pageId ?? null;
    const requestGeneration = useEditorStore
      .getState()
      .resetForDocumentAndGetGeneration(pageIdParam);
    const requestPageId = pageIdParam;
    const requestDocumentSessionId = useEditorStore.getState().documentSessionId;
    const initial = initialRef.current;

    if (!pageIdParam) {
      setSchema(initial);
      return () => {
        cancelled = true;
      };
    }

    pageSchemaApi
      .getPageSchema(pageIdParam)
      .then((result) => {
        if (cancelled) return;
        const currentGeneration = useEditorStore.getState().generation;
        const currentPageId = useEditorStore.getState().currentPageId;
        const currentSessionId = useEditorStore.getState().documentSessionId;
        if (
          currentGeneration !== requestGeneration ||
          currentPageId !== requestPageId ||
          currentSessionId !== requestDocumentSessionId
        ) {
          return;
        }
        setSchema(result.schema);
        setPageVersion(result.version);
      })
      .catch(async (error: unknown) => {
        if (cancelled) return;
        const currentGeneration = useEditorStore.getState().generation;
        const currentPageId = useEditorStore.getState().currentPageId;
        const currentSessionId = useEditorStore.getState().documentSessionId;
        if (
          currentGeneration !== requestGeneration ||
          currentPageId !== requestPageId ||
          currentSessionId !== requestDocumentSessionId
        ) {
          return;
        }

        const status =
          typeof error === 'object' && error ? (error as { status?: number }).status : undefined;
        if (status === 404) {
          try {
            const bootstrapResult = await pageSchemaApi.savePageSchema(pageIdParam, initial);
            if (cancelled) return;
            const curGen = useEditorStore.getState().generation;
            const curPageId = useEditorStore.getState().currentPageId;
            const curSessionId = useEditorStore.getState().documentSessionId;
            if (
              curGen !== requestGeneration ||
              curPageId !== requestPageId ||
              curSessionId !== requestDocumentSessionId
            ) {
              return;
            }
            setSchema(initial);
            setPageVersion(bootstrapResult.version);
            message.info(`已为页面 ${pageIdParam} 初始化默认 Schema`);
          } catch (bootstrapError) {
            const errorMessage =
              bootstrapError instanceof Error ? bootstrapError.message : '页面初始化失败';
            onErrorRef.current?.(errorMessage);
            message.error(errorMessage);
          }
          return;
        }

        const errorMessage = error instanceof Error ? error.message : '页面加载失败';
        onErrorRef.current?.(errorMessage);
        message.error('页面加载失败，已回退到本地初始内容');
      });

    return () => {
      cancelled = true;
    };
  }, [pageId, setSchema, setPageVersion, onErrorRef]);
}
