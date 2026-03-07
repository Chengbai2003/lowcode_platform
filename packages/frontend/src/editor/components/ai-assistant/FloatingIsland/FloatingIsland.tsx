import React, { useState, useEffect, useCallback } from "react";
import { Bot, X, ChevronLeft, Trash2 } from "lucide-react";
import { message, Popconfirm } from "antd";
import type {
  A2UISchema,
  AISession,
  AISessionMessage,
} from "../../../../types";
import {
  generateMessageId,
  generateSessionId,
  generateSessionTitle,
} from "../../../../types";
import { useEditorStore, useSelectionStore } from "../../../store";
import { useAIContext } from "../../../hooks/useAIContext";
import { serverAIService } from "../api/ServerAIService";
import type { AIModelConfig } from "../types/ai-types";
import { aiApi } from "../api/ai-api";
import { sessionRepository } from "../../../store/db/session-repository";
import { ChatView } from "./ChatView";
import { HistoryView, DetailView } from "./HistoryView";
import styles from "./FloatingIsland.module.scss";

interface FloatingIslandProps {
  currentSchema: A2UISchema | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

type ViewMode = "chat" | "history" | "detail";

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  currentSchema,
  onSchemaUpdate,
  onError,
}) => {
  // 状态
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("mock");
  const [view, setView] = useState<ViewMode>("chat");
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AISession | null>(
    null,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Store 状态
  const isOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const setFloatingIslandOpen = useEditorStore(
    (state) => state.setFloatingIslandOpen,
  );
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const currentSessionId = useEditorStore((state) => state.currentSessionId);
  const setCurrentSessionId = useEditorStore(
    (state) => state.setCurrentSessionId,
  );
  const addSession = useEditorStore((state) => state.addSession);

  // AI 上下文
  const aiContext = useAIContext({ currentSchema });

  // 加载历史会话
  const loadSessions = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const sessionList = await sessionRepository.listSessions();
      const fullSessions: AISession[] = [];
      for (const meta of sessionList) {
        const session = await sessionRepository.getSession(meta.id);
        if (session) fullSessions.push(session);
      }
      setSessions(fullSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // 删除会话
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await sessionRepository.deleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
          setView("history");
        }
        message.success("会话已删除");
      } catch (error) {
        console.error("Failed to delete session:", error);
        message.error("删除会话失败");
      }
    },
    [selectedSession],
  );

  // 加载模型列表
  useEffect(() => {
    if (!isOpen) return;

    const loadModels = async () => {
      try {
        const allModels = await aiApi.getModels();
        setModels(allModels);
        const defaultModel =
          allModels.find((m: AIModelConfig) => m.isDefault && m.isAvailable) ||
          allModels.find((m: AIModelConfig) => m.isAvailable);
        if (defaultModel) setCurrentModel(defaultModel.id);
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    };

    loadModels();
  }, [isOpen]);

  // 加载历史记录
  useEffect(() => {
    if (isOpen && view === "history") loadSessions();
  }, [isOpen, view, loadSessions]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    setIsLoading(true);
    const timestamp = Date.now();

    try {
      let sessionId = currentSessionId;
      let session: AISession | null = null;

      if (sessionId) {
        session = await sessionRepository.getSession(sessionId);
      }

      if (!session) {
        sessionId = generateSessionId();
        session = {
          id: sessionId,
          title: generateSessionTitle(inputValue),
          createdAt: timestamp,
          updatedAt: timestamp,
          messageCount: 0,
          lastMessageContent: "",
          lastMessageTimestamp: timestamp,
          messages: [],
        };
        await sessionRepository.createSession(session);
        setCurrentSessionId(sessionId);
        addSession({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messageCount,
          lastMessageContent: session.lastMessageContent,
          lastMessageTimestamp: session.lastMessageTimestamp,
        });
      }

      const userMessage: AISessionMessage = {
        id: generateMessageId(),
        role: "user",
        content: inputValue,
        timestamp,
        context: { selectedComponentIds: aiContext.selectedComponentIds },
      };

      let prompt = inputValue;
      if (aiContext.formattedContext) {
        prompt = `[上下文]\n${aiContext.formattedContext}\n\n[请求]\n${inputValue}`;
      }

      const lowerInput = inputValue.toLowerCase();
      if (
        lowerInput.includes("分析") ||
        lowerInput.includes("analyze") ||
        lowerInput.includes("检查")
      ) {
        if (currentSchema) {
          prompt = `${prompt}\n\n当前页面结构：\n\`\`\`json\n${JSON.stringify(currentSchema, null, 2)}\n\`\`\``;
        }
      } else if (
        lowerInput.includes("优化") ||
        lowerInput.includes("optimize") ||
        lowerInput.includes("改进") ||
        lowerInput.includes("修改") ||
        lowerInput.includes("生成")
      ) {
        if (currentSchema) {
          prompt = `${prompt}\n\n当前页面结构（如需修改请返回完整的新 Schema）：\n\`\`\`json\n${JSON.stringify(currentSchema, null, 2)}\n\`\`\``;
        }
      }

      let fullContent = "";

      if (serverAIService.streamResponse) {
        await serverAIService.streamResponse(
          {
            prompt,
            modelId: currentModel,
            context: { currentSchema: currentSchema || undefined },
          },
          (chunk: string) => {
            fullContent += chunk;
          },
          (error: Error) => {
            throw error;
          },
        );
      } else {
        const response = await serverAIService.generateResponse({
          prompt,
          modelId: currentModel,
          context: { currentSchema: currentSchema || undefined },
        });
        fullContent = response.content;
      }

      let aiSchema: A2UISchema | undefined;
      let actionResult: AISessionMessage["actionResult"] | undefined;

      try {
        const jsonPatterns = [
          /```json\s*([\s\S]*?)\s*```/,
          /```\s*([\s\S]*?)\s*```/,
          /\{[\s\S]*"rootId"[\s\S]*\}/,
        ];

        let jsonStr: string | null = null;
        for (const pattern of jsonPatterns) {
          const match = fullContent.match(pattern);
          if (match) {
            jsonStr = match[1] || match[0];
            break;
          }
        }

        if (jsonStr) {
          const cleaned = jsonStr
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
          aiSchema = JSON.parse(cleaned);
          actionResult = {
            type: "component_update",
            props: aiSchema as unknown as Record<string, unknown>,
          };
        }
      } catch (e) {
        console.warn("JSON 解析失败，AI 返回格式可能不正确:", e);
      }

      const aiMessage: AISessionMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        actionResult,
      };

      if (sessionId) {
        await sessionRepository.addMessage(sessionId, userMessage);
        await sessionRepository.addMessage(sessionId, aiMessage);
      }

      if (aiSchema) {
        onSchemaUpdate?.(aiSchema);
        message.success("Schema 已更新！");
      }

      setInputValue("");
      setFloatingIslandOpen(false);
      setView("chat");
      loadSessions();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "AI 服务暂时不可用";
      onError?.(errorMessage);
      message.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [
    inputValue,
    isLoading,
    currentSchema,
    currentModel,
    aiContext,
    onSchemaUpdate,
    onError,
    setFloatingIslandOpen,
    currentSessionId,
    setCurrentSessionId,
    addSession,
    loadSessions,
  ]);

  if (!isOpen) return null;

  const currentModelName =
    models.find((m) => m.id === currentModel)?.name || "选择模型";

  return (
    <div
      className={styles.floatingIsland}
      role="dialog"
      aria-modal="true"
      aria-label="AI 助手"
    >
      {/* 头部 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {(view === "history" || view === "detail") && (
            <button
              className={styles.backButton}
              onClick={() => {
                if (view === "detail") {
                  setSelectedSession(null);
                  setView("history");
                } else {
                  setView("chat");
                }
              }}
              aria-label="返回"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {view === "chat" && <Bot size={18} />}
          <span className={styles.headerTitle}>
            {view === "history"
              ? "历史会话"
              : view === "detail"
                ? selectedSession?.title || "会话详情"
                : "A2UI 助手"}
          </span>
        </div>
        <div className={styles.headerActions}>
          {view === "detail" && selectedSession && (
            <Popconfirm
              title="确定删除此会话？"
              onConfirm={() => handleDeleteSession(selectedSession.id)}
              okText="删除"
              cancelText="取消"
            >
              <button className={`${styles.iconButton} ${styles.danger}`}>
                <Trash2 size={16} />
              </button>
            </Popconfirm>
          )}
          <button
            className={styles.iconButton}
            onClick={() => {
              setFloatingIslandOpen(false);
              setView("chat");
            }}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className={styles.content}>
        {view === "chat" && (
          <ChatView
            inputValue={inputValue}
            isLoading={isLoading}
            models={models}
            currentModelName={currentModelName}
            hasSelectedComponents={aiContext.selectedComponentIds.length > 0}
            formattedContext={aiContext.formattedContext || ""}
            onInputChange={setInputValue}
            onSend={handleSend}
            onShowHistory={() => setView("history")}
            onClearSelection={clearSelection}
            onSelectModel={setCurrentModel}
          />
        )}

        {view === "history" && (
          <HistoryView
            sessions={sessions}
            isLoading={isLoadingHistory}
            onSelectSession={(session) => {
              setSelectedSession(session);
              setView("detail");
            }}
          />
        )}

        {view === "detail" && selectedSession && (
          <DetailView session={selectedSession} />
        )}
      </div>
    </div>
  );
};
