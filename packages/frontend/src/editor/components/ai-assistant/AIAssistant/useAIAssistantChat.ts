import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import {
  generateMessageId,
  type A2UISchema,
  type AISessionMessage,
  type AIMessageActionResult,
} from '../../../../types';
import { AIServiceError, type AIModelConfig } from '../types/ai-types';
import { serverAIService } from '../api/ServerAIService';
import { useSessionManager } from '../../../hooks';
import type { AIMessage } from './AIAssistant.types';

interface UseAIAssistantChatProps {
  currentSchema: A2UISchema | null;
  currentModel: string;
  models: AIModelConfig[];
  loadModels: () => Promise<void>;
  ensureModelsLoaded: () => Promise<void>;
  onError?: (error: string) => void;
}

export const useAIAssistantChat = ({
  currentSchema,
  currentModel,
  models,
  loadModels,
  ensureModelsLoaded,
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
      console.error('Failed to load models:', error);
    });
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content:
          '🤖 AI助手已就绪！\n\n我可以帮你：\n• 根据描述生成页面结构\n• 优化现有Schema\n• 提供设计建议\n• 分析代码质量',
        timestamp: new Date(),
      },
    ]);
  }, [loadModels]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || loading) return;

    if (models.length === 0) {
      try {
        await ensureModelsLoaded();
      } catch (error) {
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
    const aiMessage: AIMessage = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      status: 'loading',
      modelUsed: currentModel,
    };

    setMessages((prev) => [...prev, aiMessage]);

    try {
      const aiService = serverAIService;
      let fullContent = '';

      let prompt = userContent;
      const modelId = currentModel;
      const lowerInput = userContent.toLowerCase();

      if (
        lowerInput.includes('分析') ||
        lowerInput.includes('analyze') ||
        lowerInput.includes('检查')
      ) {
        if (currentSchema) {
          prompt = `请分析以下页面结构并提供改进建议：\n\`\`\`json\n${JSON.stringify(
            currentSchema,
            null,
            2,
          )}\n\`\`\`\n\n用户关注点：${userContent}`;
        }
      } else if (
        lowerInput.includes('优化') ||
        lowerInput.includes('optimize') ||
        lowerInput.includes('改进')
      ) {
        if (currentSchema) {
          prompt = `请优化以下页面结构，并返回优化后的 Schema（JSON格式）。\n\`\`\`json\n${JSON.stringify(
            currentSchema,
            null,
            2,
          )}\n\`\`\`\n\n优化需求：${userContent}`;
        }
      }

      if (aiService.streamResponse) {
        await aiService.streamResponse(
          {
            prompt,
            modelId,
            context: { currentSchema: currentSchema || undefined },
          },
          (chunk: string) => {
            fullContent += chunk;
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === aiMessageId) {
                  return {
                    ...msg,
                    content: fullContent,
                    status: 'success',
                  };
                }
                return msg;
              }),
            );
          },
          (error: Error) => {
            throw error;
          },
        );
      } else {
        const response = await aiService.generateResponse({
          prompt,
          modelId,
          context: { currentSchema: currentSchema || undefined },
        });
        fullContent = response.content;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, content: fullContent, status: 'success' } : msg,
          ),
        );
      }

      let aiSchema: A2UISchema | undefined;
      try {
        const jsonMatch =
          fullContent.match(/```json\n([\s\S]*?)\n```/) || fullContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          aiSchema = JSON.parse(jsonStr);
        }
      } catch {
        // Ignore parse error
      }

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === aiMessageId) {
            return {
              ...msg,
              schema: aiSchema,
              status: 'success',
            };
          }
          return msg;
        }),
      );

      if (aiSchema) {
        message.success('Schema 生成完毕！');
      }

      const actionResult: AIMessageActionResult | undefined = aiSchema
        ? {
            type: 'component_update',
            componentId: aiSchema.rootId,
            schemaSnapshot: aiSchema,
          }
        : undefined;
      const assistantSessionMessage: AISessionMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        actionResult,
      };

      const nextSessionMessagesAfterAssistant = [
        ...nextSessionMessagesAfterUser,
        assistantSessionMessage,
      ];
      if (session) {
        updateCurrentSessionMessages(nextSessionMessagesAfterAssistant, session);
      }
      setSessionMessages(nextSessionMessagesAfterAssistant);
    } catch (error: any) {
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
    ensureModelsLoaded,
    currentSession,
    createNewSession,
    updateCurrentSessionMessages,
    onError,
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
