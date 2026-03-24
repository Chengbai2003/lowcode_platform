import { useCallback, useEffect, useRef, useState } from 'react';
import { message, Modal } from 'antd';
import {
  generateMessageId,
  type A2UISchema,
  type AISession,
  type AISessionMessage,
  type AIMessageActionResult,
} from '../../../../types';
import { useEditorStore } from '../../../store/editor-store';
import {
  AIServiceError,
  type AgentEditPatchResponse,
  type AgentEditResponse,
  type AgentEditSchemaResponse,
  type AgentMessageProgress,
  type AgentPatchApplyHandler,
  type AgentResponseMode,
  type AIModelConfig,
} from '../types/ai-types';
import { serverAIService } from '../api/ServerAIService';
import { useSessionManager } from '../../../hooks';
import type { AIMessage } from './AIAssistant.types';

interface UseAIAssistantChatProps {
  currentSchema: A2UISchema | null;
  currentModel: string;
  pageId?: string;
  pageVersion?: number | null;
  selectedId?: string | null;
  models: AIModelConfig[];
  loadModels: () => Promise<void>;
  ensureModelsLoaded: () => Promise<void>;
  responseMode: AgentResponseMode;
  onPatchApply?: AgentPatchApplyHandler;
  onError?: (error: string) => void;
}

interface SendMessageOptions {
  instruction: string;
  userVisibleContent?: string;
  selectedIdOverride?: string;
}

const MAX_CONVERSATION_HISTORY_CHARS = 4000;
const MAX_CONVERSATION_HISTORY_TURNS = 8;
const TRUNCATION_SUFFIX = '...(truncated)';
const STREAM_REVEAL_INTERVAL_MS = 40;
const STREAM_REVEAL_CHARS_PER_TICK = 24;

function sanitizeConversationHistoryContent(content: string): string {
  return content.length <= MAX_CONVERSATION_HISTORY_CHARS
    ? content
    : `${content.slice(0, MAX_CONVERSATION_HISTORY_CHARS - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

function buildConversationHistory(messages: AISessionMessage[]) {
  return messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .slice(-MAX_CONVERSATION_HISTORY_TURNS)
    .map((item) => ({
      role: item.role,
      content: sanitizeConversationHistoryContent(item.content),
    }));
}

export const useAIAssistantChat = ({
  currentSchema,
  currentModel,
  pageId,
  pageVersion,
  selectedId,
  models,
  loadModels,
  ensureModelsLoaded,
  responseMode,
  onPatchApply,
  onError,
}: UseAIAssistantChatProps) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionMessages, setSessionMessages] = useState<AISessionMessage[]>([]);
  const { currentSession, createNewSession, updateCurrentSessionMessages } = useSessionManager({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<AIMessage[]>([]);
  const sessionMessagesRef = useRef<AISessionMessage[]>([]);
  const activeSessionRef = useRef<AISession | null>(currentSession ?? null);
  const pendingStreamChunksRef = useRef<Map<string, string>>(new Map());
  const streamRevealTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const previousSelectedIdRef = useRef<string | null | undefined>(selectedId);
  const previousPageIdRef = useRef(pageId);
  const previousSchemaRootIdRef = useRef(currentSchema?.rootId);

  const setAIScopeHighlight = useEditorStore((state) => state.setAIScopeHighlight);
  const clearAIScopeHighlight = useEditorStore((state) => state.clearAIScopeHighlight);
  const activeScopeSourceMessageId = useEditorStore((state) => state.aiScopeSourceMessageId);

  const formatErrorMessage = (error: unknown) => {
    if (error instanceof AIServiceError) {
      switch (error.code) {
        case 'API_KEY_MISSING':
          return '缺少模型 API Key，请先在管理模型中配置';
        case 'MODEL_NOT_AVAILABLE':
          return '当前模型不可用，请切换其他模型';
        case 'RATE_LIMIT':
          return '请求过于频繁，请稍后再试';
        case 'NETWORK_ERROR':
          return '网络异常或服务不可用，请稍后再试';
        case 'INVALID_RESPONSE':
          return '服务返回格式异常，请稍后再试';
        case 'PAGE_NOT_FOUND':
          return '目标页面不存在，请确认页面已初始化';
        case 'PAGE_VERSION_CONFLICT':
          return '页面版本已变化，请先保存或刷新后重试 AI 修改';
        case 'NODE_NOT_FOUND':
          return '未找到匹配的目标组件，请先选中组件后重试';
        case 'NODE_AMBIGUOUS':
          return '目标组件不明确，请先选中目标组件后重试';
        case 'PATCH_INVALID':
        case 'SCHEMA_INVALID':
          return 'AI 返回的修改结果无法应用，请稍后重试';
        case 'AGENT_TIMEOUT':
          return 'AI 编辑超时，请稍后重试';
        case 'AGENT_POLICY_BLOCKED':
          return error.message || 'AI 修改被策略拦截，请调整指令后重试';
        case 'PATCH_APPLY_FAILED':
          return error.message || 'AI patch 应用失败，请稍后重试';
        default:
          return error.message || 'AI 服务暂时不可用';
      }
    }
    return error instanceof Error ? error.message : 'AI 服务暂时不可用';
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionMessagesRef.current = sessionMessages;
  }, [sessionMessages]);

  useEffect(() => {
    if (currentSession) {
      activeSessionRef.current = currentSession;
    }
  }, [currentSession]);

  useEffect(
    () => () => {
      streamRevealTimersRef.current.forEach((timer) => clearInterval(timer));
      streamRevealTimersRef.current.clear();
      pendingStreamChunksRef.current.clear();
      clearAIScopeHighlight();
    },
    [clearAIScopeHighlight],
  );

  useEffect(() => {
    if (previousSelectedIdRef.current !== selectedId) {
      clearAIScopeHighlight();
      previousSelectedIdRef.current = selectedId;
    }
  }, [clearAIScopeHighlight, selectedId]);

  useEffect(() => {
    if (
      previousPageIdRef.current !== pageId ||
      previousSchemaRootIdRef.current !== currentSchema?.rootId
    ) {
      clearAIScopeHighlight();
      previousPageIdRef.current = pageId;
      previousSchemaRootIdRef.current = currentSchema?.rootId;
    }
  }, [clearAIScopeHighlight, currentSchema?.rootId, pageId]);

  useEffect(() => {
    loadModels().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : '加载模型失败';
      onError?.(errorMessage);
    });
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content:
          'AI助手已就绪！\n\n我可以帮你：\n• 回答页面理解问题\n• 根据描述生成页面结构\n• 预览并解释局部修改\n• 分析组件与事件配置',
        timestamp: new Date(),
      },
    ]);
  }, [loadModels, onError]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const updateAssistantMessage = useCallback(
    (messageId: string, updater: (message: AIMessage) => AIMessage) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) {
            return msg;
          }
          return updater(msg);
        }),
      );
    },
    [],
  );

  const createProgress = useCallback(
    (progress: Omit<AgentMessageProgress, 'traceId'>, traceId?: string): AgentMessageProgress => ({
      ...progress,
      traceId,
    }),
    [],
  );

  const appendTraceProgress = useCallback(
    (
      messageId: string,
      progress: Omit<AgentMessageProgress, 'traceId'>,
      traceId?: string,
    ) => {
      updateAssistantMessage(messageId, (messageItem) => {
        const nextProgress = createProgress(progress, messageItem.traceId ?? traceId);
        const previousStages = messageItem.traceSummary?.stages ?? [];
        const previousStage = previousStages[previousStages.length - 1];
        const shouldAppendStage =
          !previousStage ||
          previousStage.stage !== nextProgress.stage ||
          previousStage.label !== nextProgress.label ||
          previousStage.toolName !== nextProgress.toolName ||
          previousStage.detail !== nextProgress.detail;
        const toolCalls = nextProgress.toolName
          ? [
              ...(messageItem.traceSummary?.toolCalls ?? []),
              {
                toolName: nextProgress.toolName,
                label: nextProgress.label,
                detail: nextProgress.detail,
                stepNumber: nextProgress.stepNumber,
                success: true,
              },
            ].slice(-6)
          : (messageItem.traceSummary?.toolCalls ?? []);

        return {
          ...messageItem,
          traceId: messageItem.traceId ?? traceId,
          progress: nextProgress,
          traceSummary: {
            stages: shouldAppendStage ? [...previousStages, nextProgress].slice(-8) : previousStages,
            toolCalls,
            finishReason: nextProgress.finishReason ?? messageItem.traceSummary?.finishReason,
            errorCode: messageItem.traceSummary?.errorCode,
          },
        };
      });
    },
    [createProgress, updateAssistantMessage],
  );

  const attachTraceMeta = useCallback(
    (messageId: string, traceId: string) => {
      updateAssistantMessage(messageId, (messageItem) => ({
        ...messageItem,
        traceId,
        traceSummary: messageItem.traceSummary ?? {
          stages: [],
          toolCalls: [],
        },
        progress: {
          ...(messageItem.progress ?? { stage: 'routing', label: '正在准备请求' }),
          traceId,
        },
      }));
    },
    [updateAssistantMessage],
  );

  const attachTraceError = useCallback(
    (messageId: string, errorCode?: string, traceId?: string) => {
      updateAssistantMessage(messageId, (messageItem) => ({
        ...messageItem,
        traceId: messageItem.traceId ?? traceId,
        traceSummary: {
          stages: messageItem.traceSummary?.stages ?? [],
          toolCalls: messageItem.traceSummary?.toolCalls ?? [],
          finishReason: messageItem.traceSummary?.finishReason,
          errorCode: errorCode ?? messageItem.traceSummary?.errorCode,
        },
      }));
    },
    [updateAssistantMessage],
  );

  const persistSessionMessages = useCallback(
    (
      updater: (messages: AISessionMessage[]) => AISessionMessage[],
      sessionOverride?: AISession | null,
    ) => {
      const nextMessages = updater(sessionMessagesRef.current);
      setSessionMessages(nextMessages);
      updateCurrentSessionMessages(nextMessages, sessionOverride ?? currentSession);
      return nextMessages;
    },
    [currentSession, updateCurrentSessionMessages],
  );

  const clearStreamReveal = useCallback((messageId: string) => {
    const timer = streamRevealTimersRef.current.get(messageId);
    if (timer) {
      clearInterval(timer);
      streamRevealTimersRef.current.delete(messageId);
    }
  }, []);

  const flushStreamContent = useCallback(
    (messageId: string) => {
      const pending = pendingStreamChunksRef.current.get(messageId);
      if (!pending) {
        clearStreamReveal(messageId);
        return;
      }

      pendingStreamChunksRef.current.delete(messageId);
      clearStreamReveal(messageId);
      updateAssistantMessage(messageId, (messageItem) => ({
        ...messageItem,
        content: `${messageItem.content}${pending}`,
      }));
    },
    [clearStreamReveal, updateAssistantMessage],
  );

  const ensureStreamReveal = useCallback(
    (messageId: string) => {
      if (streamRevealTimersRef.current.has(messageId)) {
        return;
      }

      const timer = setInterval(() => {
        const pending = pendingStreamChunksRef.current.get(messageId) ?? '';
        if (!pending) {
          clearStreamReveal(messageId);
          return;
        }

        const chunk = pending.slice(0, STREAM_REVEAL_CHARS_PER_TICK);
        const rest = pending.slice(STREAM_REVEAL_CHARS_PER_TICK);

        if (rest) {
          pendingStreamChunksRef.current.set(messageId, rest);
        } else {
          pendingStreamChunksRef.current.delete(messageId);
          clearStreamReveal(messageId);
        }

        updateAssistantMessage(messageId, (messageItem) => ({
          ...messageItem,
          content: `${messageItem.content}${chunk}`,
        }));
      }, STREAM_REVEAL_INTERVAL_MS);

      streamRevealTimersRef.current.set(messageId, timer);
    },
    [clearStreamReveal, updateAssistantMessage],
  );

  const enqueueStreamContent = useCallback(
    (messageId: string, delta: string) => {
      if (!delta) {
        return;
      }

      const existing = pendingStreamChunksRef.current.get(messageId) ?? '';
      pendingStreamChunksRef.current.set(messageId, `${existing}${delta}`);
      ensureStreamReveal(messageId);
    },
    [ensureStreamReveal],
  );

  const presentStructuredError = useCallback((error: AIServiceError) => {
    if (error.code === 'PAGE_VERSION_CONFLICT') {
      Modal.warning({
        title: '页面版本冲突',
        content: '页面基线已变化，当前本地草稿未丢失。请先保存或刷新页面后，再重新发起 AI 修改。',
      });
      return;
    }

    if (error.code === 'NODE_AMBIGUOUS') {
      const candidates = (
        error.details as
          | { details?: { candidates?: Array<{ id: string; type: string }> } }
          | undefined
      )?.details?.candidates;
      const candidateText =
        candidates && candidates.length > 0
          ? `候选组件：${candidates.map((item) => `${item.type}(${item.id})`).join('、')}`
          : '请先在编辑器中选中目标组件后重试。';

      Modal.info({
        title: '目标组件不明确',
        content: candidateText,
      });
    }
  }, []);

  const formatPatchPreviewContent = useCallback((response: AgentEditPatchResponse) => {
    const warningSummary =
      response.warnings && response.warnings.length > 0
        ? `\n\n提示：${response.warnings.join('；')}`
        : '';
    return `${response.previewSummary}${warningSummary}`;
  }, []);

  const formatSchemaResultContent = useCallback((response: AgentEditSchemaResponse) => {
    if (!response.schema) {
      const warningSummary =
        response.warnings && response.warnings.length > 0
          ? `\n\n提示：${response.warnings.join('；')}`
          : '';
      return `Schema 已生成，但未能解析为可直接应用的结构。${warningSummary}`;
    }

    const componentCount = Object.keys(response.schema.components ?? {}).length;
    const summaryLines = [
      '页面结构已生成并完成校验。',
      `包含 ${componentCount} 个组件，可直接预览或应用。`,
    ];

    if (response.warnings && response.warnings.length > 0) {
      summaryLines.push(`提示：${response.warnings.join('；')}`);
    }

    return summaryLines.join('\n\n');
  }, []);

  const clearScopeHighlight = useCallback(() => {
    clearAIScopeHighlight();
  }, [clearAIScopeHighlight]);

  const applyAgentResponse = useCallback(
    ({
      messageId,
      instruction,
      response,
    }: {
      messageId: string;
      instruction: string;
      response: AgentEditResponse;
    }) => {
      let fullContent = '';
      let aiSchema: A2UISchema | undefined;
      let actionResult: AIMessageActionResult | undefined;

      switch (response.mode) {
        case 'patch':
          clearScopeHighlight();
          fullContent = formatPatchPreviewContent(response);
          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: {
              instruction,
              patch: response.patch,
              resolvedSelectedId: response.resolvedSelectedId,
              previewSchema: response.previewSchema,
              previewSummary: response.previewSummary,
              changeGroups: response.changeGroups,
              warnings: response.warnings ?? [],
              risk: response.risk,
              requiresConfirmation: response.requiresConfirmation,
              scopeSummary: response.scopeSummary,
            },
            clarification: undefined,
            intentConfirmation: undefined,
            scopeConfirmation: undefined,
            applyState: 'pending',
            progress: createProgress(
              {
                stage: 'completed',
                label: '修改预览已生成',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason ?? 'result_received',
              errorCode: undefined,
            },
          }));
          message.success('AI 修改预览已生成');
          break;
        case 'intent_confirmation':
          clearScopeHighlight();
          fullContent = response.content;
          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: undefined,
            clarification: undefined,
            intentConfirmation: {
              intentConfirmationId: response.intentConfirmationId,
              instruction,
              question: response.question,
              options: response.options,
              warnings: response.warnings ?? [],
            },
            scopeConfirmation: undefined,
            applyState: undefined,
            progress: createProgress(
              {
                stage: 'awaiting_intent_confirmation',
                label: '需要先确认你的意思',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason,
              errorCode: undefined,
            },
          }));
          break;
        case 'scope_confirmation':
          fullContent = response.content;
          setAIScopeHighlight({
            rootId: response.scope.rootId,
            targetIds: response.scope.targetIds,
            sourceMessageId: messageId,
          });
          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: undefined,
            clarification: undefined,
            intentConfirmation: undefined,
            scopeConfirmation: {
              scopeConfirmationId: response.scopeConfirmationId,
              instruction,
              question: response.question,
              scope: response.scope,
              warnings: response.warnings ?? [],
            },
            applyState: undefined,
            progress: createProgress(
              {
                stage: 'awaiting_scope_confirmation',
                label: '已识别批量范围，等待确认',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason,
              errorCode: undefined,
            },
          }));
          break;
        case 'clarification':
          clearScopeHighlight();
          fullContent = response.content;
          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: undefined,
            intentConfirmation: undefined,
            scopeConfirmation: undefined,
            clarification: {
              clarificationId: response.clarificationId,
              instruction,
              question: response.question,
              candidates: response.candidates,
            },
            progress: createProgress(
              {
                stage: 'completed',
                label: '需要用户澄清',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason,
              errorCode: undefined,
            },
          }));
          break;
        case 'answer':
          clearScopeHighlight();
          fullContent = response.content;
          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: undefined,
            clarification: undefined,
            intentConfirmation: undefined,
            scopeConfirmation: undefined,
            progress: createProgress(
              {
                stage: 'completed',
                label: '问答完成',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason ?? 'result_received',
              errorCode: undefined,
            },
          }));
          break;
        case 'schema':
          clearScopeHighlight();
          fullContent = formatSchemaResultContent(response);
          aiSchema = response.schema;
          actionResult = aiSchema
            ? {
                type: 'component_update',
                componentId: aiSchema.rootId,
                schemaSnapshot: aiSchema,
              }
            : undefined;

          updateAssistantMessage(messageId, (messageItem) => ({
            ...messageItem,
            content: fullContent,
            schema: aiSchema,
            status: 'success',
            route: response.route,
            traceId: response.traceId,
            patchPreview: undefined,
            clarification: undefined,
            intentConfirmation: undefined,
            scopeConfirmation: undefined,
            progress: createProgress(
              {
                stage: 'completed',
                label: 'Schema 生成完成',
              },
              response.traceId,
            ),
            traceSummary: {
              stages: messageItem.traceSummary?.stages ?? [],
              toolCalls: messageItem.traceSummary?.toolCalls ?? [],
              finishReason: messageItem.traceSummary?.finishReason ?? 'result_received',
              errorCode: undefined,
            },
          }));

          if (aiSchema) {
            message.success('Schema 生成完毕！');
          }
          break;
      }

      return { fullContent, aiSchema, actionResult };
    },
    [
      clearScopeHighlight,
      createProgress,
      formatPatchPreviewContent,
      formatSchemaResultContent,
      setAIScopeHighlight,
      updateAssistantMessage,
    ],
  );

  const confirmHighRiskPatch = useCallback((messageItem: AIMessage) => {
    const reasons = messageItem.patchPreview?.risk.reasons.join('；') ?? '修改范围较大';
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '确认应用高风险修改',
        content: `这次修改被标记为高风险：${reasons}。确认后会把预览 patch 应用到当前页面。`,
        okText: '确认应用',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, []);

  const applyPatchPreview = useCallback(
    async (messageId: string) => {
      const messageItem = messagesRef.current.find((item) => item.id === messageId);
      if (!messageItem?.patchPreview) {
        return false;
      }

      if (messageItem.patchPreview.requiresConfirmation) {
        const confirmed = await confirmHighRiskPatch(messageItem);
        if (!confirmed) {
          return false;
        }
      }

      updateAssistantMessage(messageId, (current) => ({
        ...current,
        applyState: 'applying',
      }));

      try {
        const nextSchema = await onPatchApply?.({
          instruction: messageItem.patchPreview.instruction,
          patch: messageItem.patchPreview.patch,
          resolvedSelectedId: messageItem.patchPreview.resolvedSelectedId,
          warnings: messageItem.patchPreview.warnings,
          traceId: messageItem.traceId ?? '',
        });

        if (!nextSchema) {
          throw new AIServiceError('AI patch 应用失败', 'PATCH_APPLY_FAILED', {
            traceId: messageItem.traceId,
          });
        }

        const actionResult: AIMessageActionResult = {
          type: 'batch_update',
          componentId: messageItem.patchPreview.resolvedSelectedId,
          schemaSnapshot: nextSchema,
        };

        updateAssistantMessage(messageId, (current) => ({
          ...current,
          applyState: 'applied',
        }));

        persistSessionMessages((prev) =>
          prev.map((sessionMessage) =>
            sessionMessage.id === messageId
              ? {
                  ...sessionMessage,
                  actionResult,
                  metadata: {
                    ...(sessionMessage.metadata ?? {}),
                    traceId: messageItem.traceId,
                    applyState: 'applied',
                  },
                }
              : sessionMessage,
          ),
        );

        message.success('AI 修改已应用');
        return true;
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        updateAssistantMessage(messageId, (current) => ({
          ...current,
          applyState: 'failed',
        }));
        onError?.(errorMessage);
        message.error(errorMessage);
        return false;
      }
    },
    [confirmHighRiskPatch, onError, onPatchApply, persistSessionMessages, updateAssistantMessage],
  );

  const submitMessage = useCallback(
    async ({ instruction, userVisibleContent, selectedIdOverride }: SendMessageOptions) => {
      const trimmedInstruction = instruction.trim();
      if (!trimmedInstruction || loading) {
        return;
      }

      clearScopeHighlight();

      if (models.length === 0) {
        try {
          await ensureModelsLoaded();
        } catch {
          message.error('加载模型列表失败，请重试');
          return;
        }
      }

      const userMessageId = generateMessageId();
      const userContent = userVisibleContent ?? trimmedInstruction;
      const userMessage: AIMessage = {
        id: userMessageId,
        type: 'user',
        content: userContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      if (!userVisibleContent) {
        setInputValue('');
      }
      setLoading(true);

      const userSessionMessage: AISessionMessage = {
        id: userMessageId,
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      };

      let session = currentSession;
      if (!session) {
        session = await createNewSession(userContent);
      }
      activeSessionRef.current = session;

      const nextSessionMessagesAfterUser = [...sessionMessagesRef.current, userSessionMessage];
      if (session) {
        updateCurrentSessionMessages(nextSessionMessagesAfterUser, session);
      }
      setSessionMessages(nextSessionMessagesAfterUser);

      const aiMessageId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          type: 'ai',
          content: '',
          timestamp: new Date(),
          status: 'loading',
          modelUsed: currentModel,
          progress: {
            stage: 'routing',
            label: '正在准备请求',
          },
          traceSummary: {
            stages: [],
            toolCalls: [],
          },
        },
      ]);

      try {
        const conversationHistory = buildConversationHistory(nextSessionMessagesAfterUser);
        const patchModeAvailable =
          Boolean(pageId) &&
          pageVersion !== null &&
          pageVersion !== undefined &&
          Boolean(onPatchApply);
        const requestedResponseMode: AgentResponseMode =
          responseMode === 'patch' && !patchModeAvailable ? 'schema' : responseMode;

        let fullContent = '';
        let actionResult: AIMessageActionResult | undefined;
        let traceId: string | undefined;
        let terminalReceived = false;
        let structuredStreamError: AIServiceError | null = null;

        const requestPayload = {
          instruction: trimmedInstruction,
          modelId: currentModel,
          pageId,
          version: pageVersion ?? undefined,
          selectedId: selectedIdOverride ?? selectedId ?? undefined,
          draftSchema: currentSchema || undefined,
          conversationHistory,
          sessionId: session?.id,
          requestIdempotencyKey: session?.id ? `${session.id}:${userMessageId}` : userMessageId,
          responseMode: requestedResponseMode,
        } as const;

        try {
          await serverAIService.streamResponse?.(requestPayload, {
            onEvent: async (event) => {
              switch (event.type) {
                case 'meta':
                  traceId = event.traceId;
                  attachTraceMeta(aiMessageId, event.traceId);
                  break;
                case 'route':
                  updateAssistantMessage(aiMessageId, (messageItem) => ({
                    ...messageItem,
                    route: event.route,
                  }));
                  break;
                case 'status':
                  appendTraceProgress(
                    aiMessageId,
                    {
                      stage: event.stage,
                      label: event.label,
                      detail: event.detail,
                      toolName: event.toolName,
                      targetId: event.targetId,
                      stepNumber: event.stepNumber,
                      finishReason: event.finishReason,
                    },
                    traceId,
                  );
                  break;
                case 'content_delta':
                  if (event.mode === 'answer') {
                    enqueueStreamContent(aiMessageId, event.delta);
                  }
                  break;
                case 'result':
                  terminalReceived = true;
                  {
                    const applied = applyAgentResponse({
                      messageId: aiMessageId,
                      instruction: trimmedInstruction,
                      response: event.result,
                    });
                    fullContent = applied.fullContent;
                    actionResult = applied.actionResult;
                    traceId = event.result.traceId;
                  }
                  break;
                case 'error':
                  terminalReceived = true;
                  attachTraceError(aiMessageId, event.error.code, event.error.traceId);
                  structuredStreamError = new AIServiceError(
                    event.error.message,
                    (event.error.code ?? 'NETWORK_ERROR') as AIServiceError['code'],
                    {
                      traceId: event.error.traceId,
                      ...(event.error.details ? { details: event.error.details } : {}),
                    },
                  );
                  break;
                case 'done':
                  break;
              }
            },
          });

          if (structuredStreamError) {
            throw structuredStreamError;
          }
        } catch (streamError) {
          if (!terminalReceived) {
            flushStreamContent(aiMessageId);
            const response = await serverAIService.generateResponse({
              ...requestPayload,
              stream: false,
            });
            const applied = applyAgentResponse({
              messageId: aiMessageId,
              instruction: trimmedInstruction,
              response,
            });
            fullContent = applied.fullContent;
            actionResult = applied.actionResult;
            traceId = response.traceId;
          } else {
            throw streamError;
          }
        }

        const assistantSessionMessage: AISessionMessage = {
          id: aiMessageId,
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now(),
          actionResult,
          metadata: traceId
            ? {
                traceId,
                applyState: actionResult ? 'applied' : undefined,
              }
            : undefined,
        };

        const nextSessionMessagesAfterAssistant = [
          ...nextSessionMessagesAfterUser,
          assistantSessionMessage,
        ];
        if (session) {
          updateCurrentSessionMessages(nextSessionMessagesAfterAssistant, session);
        }
        setSessionMessages(nextSessionMessagesAfterAssistant);
      } catch (error: unknown) {
        flushStreamContent(aiMessageId);
        clearScopeHighlight();
        if (error instanceof AIServiceError) {
          presentStructuredError(error);
        }
        const errorMessage = formatErrorMessage(error);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId) {
              return {
                ...msg,
                content: msg.content + `\n\n[ERROR: ${errorMessage}]`,
                status: 'error',
              };
            }
            return msg;
          }),
        );
        onError?.(errorMessage);
      } finally {
        clearStreamReveal(aiMessageId);
        pendingStreamChunksRef.current.delete(aiMessageId);
        setLoading(false);
      }
    },
    [
      loading,
      models.length,
      ensureModelsLoaded,
      currentSession,
      createNewSession,
      updateCurrentSessionMessages,
      currentModel,
      pageId,
      pageVersion,
      selectedId,
      currentSchema,
      responseMode,
      onPatchApply,
      formatPatchPreviewContent,
      formatSchemaResultContent,
      clearScopeHighlight,
      flushStreamContent,
      enqueueStreamContent,
      clearStreamReveal,
      createProgress,
      applyAgentResponse,
      updateAssistantMessage,
      presentStructuredError,
      onError,
    ],
  );

  const sendMessage = useCallback(async () => {
    await submitMessage({ instruction: inputValue });
  }, [inputValue, submitMessage]);

  const resolveClarification = useCallback(
    async (messageId: string, candidateId: string, candidateLabel: string) => {
      const messageItem = messagesRef.current.find((item) => item.id === messageId);
      if (!messageItem?.clarification) {
        return;
      }

      await submitMessage({
        instruction: messageItem.clarification.instruction,
        userVisibleContent: `选择候选组件：${candidateLabel}`,
        selectedIdOverride: candidateId,
      });
    },
    [submitMessage],
  );

  const confirmIntent = useCallback(
    async (messageId: string, intentId: string) => {
      const messageItem = messagesRef.current.find((item) => item.id === messageId);
      if (!messageItem?.intentConfirmation || loading) {
        return;
      }

      const activeSession = activeSessionRef.current;
      const conversationHistory = buildConversationHistory(sessionMessagesRef.current);
      const instruction = messageItem.intentConfirmation.instruction;

      updateAssistantMessage(messageId, (current) => ({
        ...current,
        status: 'loading',
        progress: createProgress(
          {
            stage: 'planning_scope',
            label: '正在根据已确认语义解析批量范围',
          },
          current.traceId,
        ),
      }));
      setLoading(true);

      let fullContent = messageItem.content;
      let actionResult: AIMessageActionResult | undefined;
      let traceId = messageItem.traceId;
      let terminalReceived = false;
      let structuredStreamError: AIServiceError | null = null;

      const requestPayload = {
        instruction,
        modelId: currentModel,
        pageId,
        version: pageVersion ?? undefined,
        selectedId: selectedId ?? undefined,
        draftSchema: currentSchema || undefined,
        conversationHistory,
        sessionId: activeSession?.id,
        confirmedIntentId: intentId,
        requestIdempotencyKey: activeSession?.id
          ? `${activeSession.id}:${messageId}:intent:${intentId}`
          : `${messageId}:intent:${intentId}`,
        responseMode,
      } as const;

      try {
        try {
          await serverAIService.streamResponse?.(requestPayload, {
            onEvent: async (event) => {
              switch (event.type) {
                case 'meta':
                  traceId = event.traceId;
                  attachTraceMeta(messageId, event.traceId);
                  break;
                case 'route':
                  updateAssistantMessage(messageId, (current) => ({
                    ...current,
                    route: event.route,
                  }));
                  break;
                case 'status':
                  appendTraceProgress(
                    messageId,
                    {
                      stage: event.stage,
                      label: event.label,
                      detail: event.detail,
                      toolName: event.toolName,
                      targetId: event.targetId,
                      stepNumber: event.stepNumber,
                      finishReason: event.finishReason,
                    },
                    traceId,
                  );
                  break;
                case 'content_delta':
                  break;
                case 'result':
                  terminalReceived = true;
                  {
                    const applied = applyAgentResponse({
                      messageId,
                      instruction,
                      response: event.result,
                    });
                    fullContent = applied.fullContent;
                    actionResult = applied.actionResult;
                    traceId = event.result.traceId;
                  }
                  break;
                case 'error':
                  terminalReceived = true;
                  attachTraceError(messageId, event.error.code, event.error.traceId);
                  structuredStreamError = new AIServiceError(
                    event.error.message,
                    (event.error.code ?? 'NETWORK_ERROR') as AIServiceError['code'],
                    {
                      traceId: event.error.traceId,
                      ...(event.error.details ? { details: event.error.details } : {}),
                    },
                  );
                  break;
                case 'done':
                  break;
              }
            },
          });

          if (structuredStreamError) {
            throw structuredStreamError;
          }
        } catch (streamError) {
          if (!terminalReceived) {
            const response = await serverAIService.generateResponse({
              ...requestPayload,
              stream: false,
            });
            const applied = applyAgentResponse({
              messageId,
              instruction,
              response,
            });
            fullContent = applied.fullContent;
            actionResult = applied.actionResult;
            traceId = response.traceId;
          } else {
            throw streamError;
          }
        }

        persistSessionMessages(
          (prev) =>
            prev.map((sessionMessage) =>
              sessionMessage.id === messageId
                ? {
                    ...sessionMessage,
                    content: fullContent,
                    actionResult,
                    metadata: traceId
                      ? {
                          ...(sessionMessage.metadata ?? {}),
                          traceId,
                          applyState: actionResult ? 'applied' : undefined,
                        }
                      : sessionMessage.metadata,
                  }
                : sessionMessage,
            ),
          activeSession,
        );
      } catch (error) {
        clearScopeHighlight();
        if (error instanceof AIServiceError) {
          presentStructuredError(error);
        }
        const errorMessage = formatErrorMessage(error);
        updateAssistantMessage(messageId, (current) => ({
          ...current,
          content: `${current.content}\n\n[ERROR: ${errorMessage}]`,
          status: 'error',
        }));
        onError?.(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      currentModel,
      pageId,
      pageVersion,
      selectedId,
      currentSchema,
      responseMode,
      updateAssistantMessage,
      createProgress,
      applyAgentResponse,
      persistSessionMessages,
      clearScopeHighlight,
      presentStructuredError,
      onError,
      attachTraceMeta,
      appendTraceProgress,
      attachTraceError,
    ],
  );

  const confirmScope = useCallback(
    async (messageId: string) => {
      const messageItem = messagesRef.current.find((item) => item.id === messageId);
      if (!messageItem?.scopeConfirmation || loading) {
        return;
      }

      const activeSession = activeSessionRef.current;
      const conversationHistory = buildConversationHistory(sessionMessagesRef.current);
      const instruction = messageItem.scopeConfirmation.instruction;

      updateAssistantMessage(messageId, (current) => ({
        ...current,
        status: 'loading',
        progress: createProgress(
          {
            stage: 'calling_model',
            label: '正在根据已确认范围生成 patch 预览',
          },
          current.traceId,
        ),
      }));
      setLoading(true);

      let fullContent = messageItem.content;
      let actionResult: AIMessageActionResult | undefined;
      let traceId = messageItem.traceId;
      let terminalReceived = false;
      let structuredStreamError: AIServiceError | null = null;

      const requestPayload = {
        instruction,
        modelId: currentModel,
        pageId,
        version: pageVersion ?? undefined,
        selectedId: selectedId ?? undefined,
        draftSchema: currentSchema || undefined,
        conversationHistory,
        sessionId: activeSession?.id,
        confirmedScopeId: messageItem.scopeConfirmation.scopeConfirmationId,
        requestIdempotencyKey: activeSession?.id
          ? `${activeSession.id}:${messageId}:scope:${messageItem.scopeConfirmation.scopeConfirmationId}`
          : `${messageId}:scope:${messageItem.scopeConfirmation.scopeConfirmationId}`,
        responseMode,
      } as const;

      try {
        try {
          await serverAIService.streamResponse?.(requestPayload, {
            onEvent: async (event) => {
              switch (event.type) {
                case 'meta':
                  traceId = event.traceId;
                  attachTraceMeta(messageId, event.traceId);
                  break;
                case 'route':
                  updateAssistantMessage(messageId, (current) => ({
                    ...current,
                    route: event.route,
                  }));
                  break;
                case 'status':
                  appendTraceProgress(
                    messageId,
                    {
                      stage: event.stage,
                      label: event.label,
                      detail: event.detail,
                      toolName: event.toolName,
                      targetId: event.targetId,
                      stepNumber: event.stepNumber,
                      finishReason: event.finishReason,
                    },
                    traceId,
                  );
                  break;
                case 'content_delta':
                  break;
                case 'result':
                  terminalReceived = true;
                  {
                    const applied = applyAgentResponse({
                      messageId,
                      instruction,
                      response: event.result,
                    });
                    fullContent = applied.fullContent;
                    actionResult = applied.actionResult;
                    traceId = event.result.traceId;
                  }
                  break;
                case 'error':
                  terminalReceived = true;
                  attachTraceError(messageId, event.error.code, event.error.traceId);
                  structuredStreamError = new AIServiceError(
                    event.error.message,
                    (event.error.code ?? 'NETWORK_ERROR') as AIServiceError['code'],
                    {
                      traceId: event.error.traceId,
                      ...(event.error.details ? { details: event.error.details } : {}),
                    },
                  );
                  break;
                case 'done':
                  break;
              }
            },
          });

          if (structuredStreamError) {
            throw structuredStreamError;
          }
        } catch (streamError) {
          if (!terminalReceived) {
            const response = await serverAIService.generateResponse({
              ...requestPayload,
              stream: false,
            });
            const applied = applyAgentResponse({
              messageId,
              instruction,
              response,
            });
            fullContent = applied.fullContent;
            actionResult = applied.actionResult;
            traceId = response.traceId;
          } else {
            throw streamError;
          }
        }

        persistSessionMessages(
          (prev) =>
            prev.map((sessionMessage) =>
              sessionMessage.id === messageId
                ? {
                    ...sessionMessage,
                    content: fullContent,
                    actionResult,
                    metadata: traceId
                      ? {
                          ...(sessionMessage.metadata ?? {}),
                          traceId,
                          applyState: actionResult ? 'applied' : undefined,
                        }
                      : sessionMessage.metadata,
                  }
                : sessionMessage,
            ),
          activeSession,
        );
      } catch (error) {
        clearScopeHighlight();
        if (error instanceof AIServiceError) {
          presentStructuredError(error);
        }
        const errorMessage = formatErrorMessage(error);
        updateAssistantMessage(messageId, (current) => ({
          ...current,
          content: `${current.content}\n\n[ERROR: ${errorMessage}]`,
          status: 'error',
        }));
        onError?.(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      currentModel,
      pageId,
      pageVersion,
      selectedId,
      currentSchema,
      responseMode,
      updateAssistantMessage,
      createProgress,
      applyAgentResponse,
      persistSessionMessages,
      clearScopeHighlight,
      presentStructuredError,
      onError,
    ],
  );

  const restoreScopeHighlight = useCallback(
    (messageId: string) => {
      const messageItem = messagesRef.current.find((item) => item.id === messageId);
      if (!messageItem?.scopeConfirmation) {
        return;
      }

      setAIScopeHighlight({
        rootId: messageItem.scopeConfirmation.scope.rootId,
        targetIds: messageItem.scopeConfirmation.scope.targetIds,
        sourceMessageId: messageId,
      });
    },
    [setAIScopeHighlight],
  );

  return {
    messages,
    inputValue,
    setInputValue,
    loading,
    sendMessage,
    applyPatchPreview,
    resolveClarification,
    confirmIntent,
    confirmScope,
    clearScopeHighlight,
    restoreScopeHighlight,
    activeScopeSourceMessageId,
    messagesEndRef,
  };
};
