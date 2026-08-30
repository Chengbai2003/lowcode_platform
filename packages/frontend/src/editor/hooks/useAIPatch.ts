import { useCallback } from 'react';
import { message } from 'antd';
import type { PageSchema } from '../../types';
import { validateAndAutoFixA2UISchema } from '../../schema/schemaValidation';
import { createPatchCommand } from '../commands/schemaCommands';
import { useEditorStore } from '../store/editor-store';
import type { AgentPatchApplyPayload } from '../components/ai-assistant/types/ai-types';

interface Params {
  allComponents: Record<string, React.ComponentType<Record<string, unknown>>>;
  handleSchemaUpdate: (s: PageSchema) => void;
  forceUpdateSchema: (s: PageSchema, desc: string) => void;
  executeSchemaCommand: (c: ReturnType<typeof createPatchCommand>) => void;
  schemaRef: React.MutableRefObject<PageSchema>;
  pageVersionRef: React.MutableRefObject<number | null>;
  mountedRef: React.MutableRefObject<boolean>;
  selectComponent: (id: string) => void;
  onError?: (msg: string) => void;
}

export function useAIPatch({
  allComponents,
  handleSchemaUpdate,
  forceUpdateSchema,
  executeSchemaCommand,
  schemaRef,
  pageVersionRef,
  mountedRef,
  selectComponent,
  onError,
}: Params) {
  const handleAISchemaUpdate = useCallback(
    (newSchema: PageSchema) => {
      const whitelist = Object.keys(allComponents);
      const result = validateAndAutoFixA2UISchema(newSchema, whitelist);
      if (!result.success) {
        const errorMessage = result.error.issues[0]?.message || 'Schema 校验失败';
        onError?.(errorMessage);
        message.error(`AI Schema 无法应用：${errorMessage}`);
        return false;
      }
      if (result.fixes.length > 0) {
        message.info(`已自动修复 ${result.fixes.length} 处 Schema 问题`);
      }
      useEditorStore.getState().bumpSchemaRevision();
      forceUpdateSchema(result.data, 'AI 更新 Schema');
      message.success('Schema 已更新！');
      return true;
    },
    [allComponents, forceUpdateSchema, onError],
  );

  const describeAIPatch = useCallback((instruction: string, patchCount: number) => {
    const trimmed = instruction.trim();
    const summary = trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
    return patchCount > 0 ? `AI 修改：${summary || '应用 patch'}` : 'AI 修改';
  }, []);

  const handleAIPatchApply = useCallback(
    async ({
      instruction,
      patch,
      resolvedSelectedId,
      warnings,
      sourcePageId,
      basePageVersion,
      sourceGeneration,
      documentSessionId,
      schemaRevision,
    }: AgentPatchApplyPayload): Promise<PageSchema | null> => {
      const editorState = useEditorStore.getState();
      if (
        !mountedRef.current ||
        (sourcePageId ?? null) !== (editorState.currentPageId ?? null) ||
        sourceGeneration !== editorState.generation ||
        documentSessionId !== editorState.documentSessionId ||
        schemaRevision !== editorState.schemaRevision
      ) {
        message.error('页面已切换或本地已编辑，AI 修改已过期，已拦截');
        return null;
      }
      const currentVersion = pageVersionRef.current ?? null;
      if (basePageVersion !== currentVersion) {
        message.error('页面版本已变化，该预览已过期，已拦截');
        return null;
      }
      try {
        const baseSchema = schemaRef.current;
        const cur2 = useEditorStore.getState();
        if (
          (sourcePageId ?? null) !== (cur2.currentPageId ?? null) ||
          sourceGeneration !== cur2.generation ||
          documentSessionId !== cur2.documentSessionId ||
          schemaRevision !== cur2.schemaRevision
        ) {
          message.error('页面已切换或本地已编辑，AI 修改已过期，已拦截');
          return null;
        }
        const currentVersion2 = pageVersionRef.current ?? null;
        if (basePageVersion !== currentVersion2) {
          message.error('页面版本已变化，该预览已过期，已拦截');
          return null;
        }
        const command = createPatchCommand(
          baseSchema,
          patch,
          handleSchemaUpdate,
          describeAIPatch(instruction, patch.length),
        );

        executeSchemaCommand(command);
        const nextSchema = command.getNewSchema();
        if (resolvedSelectedId && nextSchema.components[resolvedSelectedId]) {
          selectComponent(resolvedSelectedId);
        }
        if (warnings && warnings.length > 0) {
          message.info(`AI 修改已应用，并返回 ${warnings.length} 条提示`);
        }
        return nextSchema;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'AI patch 应用失败';
        onError?.(errorMessage);
        message.error(errorMessage);
        return null;
      }
    },
    [
      describeAIPatch,
      executeSchemaCommand,
      handleSchemaUpdate,
      onError,
      selectComponent,
      mountedRef,
      pageVersionRef,
      schemaRef,
    ],
  );

  return { handleAISchemaUpdate, handleAIPatchApply, describeAIPatch };
}
