import { useCallback, useEffect, useRef, useState } from 'react';
import { message, Modal } from 'antd';
import {
  generateMessageId,
  type A2UISchema,
  type AISessionMessage,
  type AIMessageActionResult,
} from '../../../../types';
import {
  AIServiceError,
  type AgentEditResponse,
  type AgentMessageProgress,
  type AgentResponseMode,
  type AIModelConfig,
  type AgentPatchApplyHandler,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionMessagesRef = useRef<AISessionMessage[]>([]);

  const { currentSession, createNewSession, updateCurrentSessionMessages } = useSessionManager({});

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
    sessionMessagesRef.current = sessionMessages;
  }, [sessionMessages]);

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
          'AI助手已就绪！\n\n我可以帮你：\n• 根据描述生成页面结构\n• 优化现有Schema\n• 提供设计建议\n• 分析代码质量',
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

  const summarizePatchResponse = useCallback(
    (response: Extract<AgentEditResponse, { mode: 'patch' }>) => {
      const summaryByOp: Record<string, string> = {
        insertComponent: '插入组件',
        updateProps: '更新组件属性',
        bindEvent: '绑定组件事件',
        removeComponent: '删除组件',
        moveComponent: '移动组件',
      };
      const operationSummary = response.patch
        .map((operation) => summaryByOp[operation.op] ?? operation.op)
        .join('、');
      const warningSummary =
        response.warnings && response.warnings.length > 0
          ? `\n\n提示：${response.warnings.join('；')}`
          : '';

      return `已应用 ${response.patch.length} 个 patch：${operationSummary}${warningSummary}`;
    },
    [],
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

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || loading) return;

    if (models.length === 0) {
      try {
        await ensureModelsLoaded();
      } catch {
        message.error('加载模型列表失败，请重试');
        return;
      }
    }

    const userContent = inputValue;
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: userContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    const userSessionMessage: AISessionMessage = {
      id: generateMessageId(),
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    };

    let session = currentSession;
    if (!session) {
      session = await createNewSession(userContent);
    }

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
      },
    ]);

    try {
      const conversationHistory = nextSessionMessagesAfterUser.map((item) => ({
        role: item.role,
        content: item.content,
      }));
      const patchModeAvailable =
        Boolean(pageId) &&
        pageVersion !== null &&
        pageVersion !== undefined &&
        Boolean(onPatchApply);
      const requestedResponseMode: AgentResponseMode =
        responseMode === 'patch' && !patchModeAvailable
          ? 'schema'
          : responseMode === 'auto' && !patchModeAvailable
            ? 'schema'
            : responseMode;

      let fullContent = '';
      let aiSchema: A2UISchema | undefined;
      let actionResult: AIMessageActionResult | undefined;
      let traceId: string | undefined;
      let terminalReceived = false;
      let structuredStreamError: AIServiceError | null = null;

      const requestPayload = {
        instruction: userContent,
        modelId: currentModel,
        pageId,
        version: pageVersion ?? undefined,
        selectedId: selectedId ?? undefined,
        draftSchema: currentSchema || undefined,
        conversationHistory,
        responseMode: requestedResponseMode,
      } as const;

      const applyAgentResponse = async (response: AgentEditResponse) => {
        traceId = response.traceId;

        if (response.mode === 'patch') {
          const nextSchema = await onPatchApply?.({
            instruction: userContent,
            patch: response.patch,
            resolvedSelectedId: response.resolvedSelectedId,
            warnings: response.warnings,
            traceId: response.traceId,
          });

          if (!nextSchema) {
            throw new AIServiceError('AI patch 应用失败', 'PATCH_APPLY_FAILED', {
              traceId: response.traceId,
            });
          }

          fullContent = summarizePatchResponse(response);
          actionResult = {
            type: 'batch_update',
            componentId: response.resolvedSelectedId,
            schemaSnapshot: nextSchema,
          };
          message.success('AI 修改已应用');
        } else {
          fullContent = response.content;
          aiSchema = response.schema;
          actionResult = aiSchema
            ? {
                type: 'component_update',
                componentId: aiSchema.rootId,
                schemaSnapshot: aiSchema,
              }
            : undefined;

          if (aiSchema) {
            message.success('Schema 生成完毕！');
          }
        }

        updateAssistantMessage(aiMessageId, (messageItem) => ({
          ...messageItem,
          content: fullContent,
          schema: aiSchema,
          status: 'success',
          route: response.route,
          traceId: response.traceId,
          progress: createProgress(
            {
              stage: 'completed',
              label: '处理完成',
            },
            response.traceId,
          ),
        }));
      };

      try {
        await serverAIService.streamResponse?.(requestPayload, {
          onEvent: async (event) => {
            switch (event.type) {
              case 'meta':
                traceId = event.traceId;
                updateAssistantMessage(aiMessageId, (messageItem) => ({
                  ...messageItem,
                  traceId: event.traceId,
                  progress: {
                    ...(messageItem.progress ?? { stage: 'routing', label: '正在准备请求' }),
                    traceId: event.traceId,
                  },
                }));
                break;
              case 'route':
                updateAssistantMessage(aiMessageId, (messageItem) => ({
                  ...messageItem,
                  route: event.route,
                }));
                break;
              case 'status':
                updateAssistantMessage(aiMessageId, (messageItem) => ({
                  ...messageItem,
                  progress: createProgress(
                    {
                      stage: event.stage,
                      label: event.label,
                      detail: event.detail,
                      toolName: event.toolName,
                      targetId: event.targetId,
                      stepNumber: event.stepNumber,
                      finishReason: event.finishReason,
                    },
                    messageItem.traceId ?? traceId,
                  ),
                }));
                break;
              case 'result':
                terminalReceived = true;
                await applyAgentResponse(event.result);
                break;
              case 'error':
                terminalReceived = true;
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
          await applyAgentResponse(response);
        } else {
          throw streamError;
        }
      }

      const assistantSessionMessage: AISessionMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        actionResult,
        metadata: traceId
          ? {
              traceId,
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
      setLoading(false);
    }
  }, [
    inputValue,
    loading,
    models.length,
    currentModel,
    currentSchema,
    pageId,
    pageVersion,
    selectedId,
    ensureModelsLoaded,
    currentSession,
    createNewSession,
    updateCurrentSessionMessages,
    responseMode,
    onPatchApply,
    onError,
    presentStructuredError,
    summarizePatchResponse,
    updateAssistantMessage,
    createProgress,
  ]);

  return {
    messages,
    inputValue,
    setInputValue,
    loading,
    sendMessage,
    messagesEndRef,
  };
};
