import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  CloseOutlined,
  SendOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  LoadingOutlined,
  AimOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { message, Dropdown } from "antd";
import type {
  A2UISchema,
  AISession,
  AISessionMessage,
} from "@lowcode-platform/types";
import {
  generateMessageId,
  generateSessionId,
  generateSessionTitle,
} from "@lowcode-platform/types";
import { useEditorStore, useSelectionStore } from "../../../store";
import { useAIContext } from "../../../hooks/useAIContext";
import { serverAIService } from "../api/ServerAIService";
import type { AIModelConfig } from "../types/ai-types";
import { aiApi } from "../api/ai-api";
import { sessionRepository } from "../../../store/db/session-repository";
import styles from "./FloatingIsland.module.css";

interface FloatingIslandProps {
  currentSchema: A2UISchema | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  currentSchema,
  onSchemaUpdate,
  onError,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("mock");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Store 状态
  const isOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const setFloatingIslandOpen = useEditorStore(
    (state) => state.setFloatingIslandOpen,
  );
  const toggleHistoryDrawer = useEditorStore(
    (state) => state.toggleHistoryDrawer,
  );
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const currentSessionId = useEditorStore((state) => state.currentSessionId);
  const setCurrentSessionId = useEditorStore(
    (state) => state.setCurrentSessionId,
  );
  const addSession = useEditorStore((state) => state.addSession);

  // AI 上下文
  const aiContext = useAIContext({ currentSchema });

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const allModels = await aiApi.getModels();
        setModels(allModels);

        const defaultModel =
          allModels.find((m: AIModelConfig) => m.isDefault && m.isAvailable) ||
          allModels.find((m: AIModelConfig) => m.isAvailable);
        if (defaultModel) {
          setCurrentModel(defaultModel.id);
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    };

    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  // 自动聚焦
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // 自动调整高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    setIsLoading(true);
    const timestamp = Date.now();

    try {
      // 1. 获取或创建当前会话
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

      // 2. 创建用户消息
      const userMessage: AISessionMessage = {
        id: generateMessageId(),
        role: "user",
        content: inputValue,
        timestamp,
        context: {
          selectedComponentIds: aiContext.selectedComponentIds,
        },
      };

      let prompt = inputValue;
      const lowerInput = inputValue.toLowerCase();

      // 构建带上下文的 prompt
      if (aiContext.formattedContext) {
        prompt = `[上下文]\n${aiContext.formattedContext}\n\n[请求]\n${inputValue}`;
      }

      // 根据关键词增强 prompt
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

      // 使用流式响应
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

      // 3. 解析 Schema（增强容错）
      let aiSchema: A2UISchema | undefined;
      let actionResult: AISessionMessage["actionResult"] | undefined;

      try {
        // 尝试多种 JSON 提取方式
        const jsonPatterns = [
          /```json\s*([\s\S]*?)\s*```/, // 标准 markdown
          /```\s*([\s\S]*?)\s*```/, // 无语言标记
          /\{[\s\S]*"rootId"[\s\S]*\}/, // 直接 JSON 对象
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
          // 清理可能的尾随逗号和注释
          const cleaned = jsonStr
            .replace(/,\s*([}\]])/g, "$1") // 移除尾随逗号
            .replace(/\/\/.*$/gm, "") // 移除单行注释
            .replace(/\/\*[\s\S]*?\*\//g, ""); // 移除多行注释

          aiSchema = JSON.parse(cleaned);

          // 构建 actionResult 用于回滚
          actionResult = {
            type: "component_update",
            props: aiSchema as unknown as Record<string, unknown>,
          };
        }
      } catch (e) {
        console.warn("JSON 解析失败，AI 返回格式可能不正确:", e);
      }

      // 4. 创建 AI 消息
      const aiMessage: AISessionMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        actionResult,
      };

      // 5. 保存消息到会话
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
    } catch (error: any) {
      onError?.(error.message || "AI 服务暂时不可用");
      message.error(error.message || "AI 服务暂时不可用");
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
  ]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 模型选择菜单
  const modelMenuItems = models.map((model) => ({
    key: model.id,
    label: (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{model.name}</span>
        {model.isDefault && (
          <span style={{ fontSize: 12, color: "#999" }}>默认</span>
        )}
      </div>
    ),
    onClick: () => setCurrentModel(model.id),
  }));

  const currentModelName =
    models.find((m) => m.id === currentModel)?.name || "选择模型";

  if (!isOpen) return null;

  return (
    <div
      className={styles.main}
      role="dialog"
      aria-modal="true"
      aria-label="AI 助手"
    >
      {/* 头部 */}
      <div className={styles.header}>
        <span className={styles.title}>AI 助手</span>
        <button
          className={styles.closeButton}
          onClick={() => setFloatingIslandOpen(false)}
          aria-label="关闭"
        >
          <CloseOutlined />
        </button>
      </div>

      {/* 上下文标签 */}
      {aiContext.selectedComponentIds.length > 0 && (
        <div className={styles.contextChip}>
          <AimOutlined className={styles.contextIcon} />
          <span className={styles.contextText}>
            {aiContext.formattedContext}
          </span>
          <button
            className={styles.clearContext}
            onClick={clearSelection}
            aria-label="清除选择"
          >
            <CloseCircleOutlined />
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的修改，或让 AI 优化现有设计..."
          rows={2}
          disabled={isLoading}
          aria-label="输入你的问题"
        />

        <div className={styles.footer}>
          <div className={styles.leftActions}>
            {/* 模型选择 */}
            <Dropdown menu={{ items: modelMenuItems }} trigger={["click"]}>
              <button className={styles.modelButton} type="button">
                <DatabaseOutlined />
                <span>{currentModelName}</span>
              </button>
            </Dropdown>

            {/* 历史记录 */}
            <button
              className={styles.historyButton}
              onClick={() => {
                setFloatingIslandOpen(false);
                toggleHistoryDrawer();
              }}
              aria-label="查看历史记录"
            >
              <HistoryOutlined />
            </button>
          </div>

          {/* 发送按钮 */}
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="发送消息"
          >
            {isLoading ? <LoadingOutlined /> : <SendOutlined />}
            <span>发送</span>
          </button>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>AI 正在生成...</span>
        </div>
      )}
    </div>
  );
};
