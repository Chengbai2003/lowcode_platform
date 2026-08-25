import { useEffect, useRef } from 'react';
import { message } from 'antd';
import type { A2UISchema } from '../../types';
import { useEditorStore } from '../store/editor-store';
import { pageSchemaApi } from '../services/pageSchemaApi';

/**
 * Page lifecycle hook — handles initial load, generation guard and 404 bootstrap.
 * Extracted from LowcodeEditorInner to keep the facade thin.
 *
 * Must be called with stable refs for syncSchemaVersion to avoid re-trigger.
 */
interface Params {
  pageId: string | undefined;
  initialSchemaObj: A2UISchema;
  setSchema: React.Dispatch<React.SetStateAction<A2UISchema>>;
  setPageVersion: (v: number | null) => void;
  syncSchemaVersion: (next: A2UISchema, targetVersion?: number | null) => A2UISchema;
  onErrorRef: React.MutableRefObject<((msg: string) => void) | undefined>;
}

export function usePageLifecycle({
  pageId,
  initialSchemaObj,
  setSchema,
  setPageVersion,
  syncSchemaVersion,
  onErrorRef,
}: Params) {
  const syncRef = useRef(syncSchemaVersion);
  useEffect(() => {
    syncRef.current = syncSchemaVersion;
  }, [syncSchemaVersion]);

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
        setSchema(syncRef.current(result.schema, result.version));
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
            setSchema(syncRef.current(initial, bootstrapResult.version));
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
