import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button, Input, Space, Divider, Tooltip, message, Layout } from "antd";
import {
  SendOutlined,
  BulbOutlined,
  RobotOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { A2UISchema } from "@lowcode-platform/renderer";
import type { AISessionMessage } from "@lowcode-platform/types";
import { SessionSidebar } from "./AI/SessionSidebar";
import { useSessionManager } from "../hooks/useSessionManager";
import { MockAIService } from "../services/MockAIService";
import "./AIAssistant.css";

const { Sider, Content } = Layout;

interface AIAssistantProps {
  currentSchema: A2UISchema | null;
  onSchemaUpdate: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

interface UIMessage {
  id: string;
  type: "user" | "assistant" | "system" | "loading" | "error";
  content: string;
  timestamp: Date;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  currentSchema,
  onSchemaUpdate,
  onError,
}) => {
  // 使用会话管理 Hook（基于 IndexedDB）
  const {
    sessions,
    currentSession,
    createNewSession,
    switchSession,
    deleteSession,
    updateCurrentSessionMessages,
  } = useSessionManager({ projectId: currentSchema?.rootId });

  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiService = MockAIService.getInstance();

  // 从当前会话加载消息
  const messages: UIMessage[] =
    currentSession?.messages.map((msg) => ({
      id: msg.id,
      type:
        msg.role === "user"
          ? "user"
          : msg.role === "assistant"
            ? "assistant"
            : "system",
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    })) || [];

  // 滚动到最新消息
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const [inputValue, setInputValue] = useState("");

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage: AISessionMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    setInputValue("");
    setLoading(true);

    try {
      let response;

      // 根据用户输入判断意图
      const lowerInput = inputValue.toLowerCase();

      if (
        lowerInput.includes("分析") ||
        lowerInput.includes("analyze") ||
        lowerInput.includes("检查")
      ) {
        const schema = currentSchema || { rootId: "root", components: {} };
        response = await aiService.analyzeSchema(schema);
      } else if (
        lowerInput.includes("优化") ||
        lowerInput.includes("optimize") ||
        lowerInput.includes("改进")
      ) {
        const schema = currentSchema || { rootId: "root", components: {} };
        response = await aiService.optimizeSchema(schema);
      } else {
        response = await aiService.generateSchema(inputValue);
      }

      // 创建 AI 回复消息
      const aiMessage: AISessionMessage = {
        id: `msg_ai_${Date.now()}`,
        role: "assistant",
        content:
          "explanation" in response
            ? response.explanation
            : "analysis" in response
              ? response.analysis
              : response.suggestions?.join("\n") || "已优化您的页面布局",
        timestamp: Date.now(),
      };

      // 更新当前会话的消息
      const updatedMessages = currentSession
        ? [...currentSession.messages, userMessage, aiMessage]
        : [userMessage, aiMessage];

      updateCurrentSessionMessages(updatedMessages);

      if ("schema" in response) {
        onSchemaUpdate(response.schema);
        message.success("Schema 已更新！");
      }
    } catch (error) {
      const errorMessage: AISessionMessage = {
        id: `msg_error_${Date.now()}`,
        role: "assistant",
        content: "抱歉，处理你的请求时遇到了问题。请稍后重试。",
        timestamp: Date.now(),
      };

      const updatedMessages = currentSession
        ? [...currentSession.messages, userMessage, errorMessage]
        : [userMessage, errorMessage];

      updateCurrentSessionMessages(updatedMessages);
      onError?.("AI 服务暂时不可用");
    } finally {
      setLoading(false);
    }
  }, [
    inputValue,
    loading,
    currentSession,
    updateCurrentSessionMessages,
    currentSchema,
    onSchemaUpdate,
    onError,
  ]);

  const handleQuickAction = useCallback(
    async (action: string) => {
      setInputValue(action);
      setTimeout(() => handleSendMessage(), 100);
    },
    [handleSendMessage],
  );

  // 处理首次发送消息时创建会话
  useEffect(() => {
    if (messages.length === 0 && inputValue && !currentSession) {
      createNewSession(inputValue);
    }
  }, []);

  return (
    <Layout className="ai-assistant-layout">
      <Sider width={280} className="session-sider">
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSession?.id || null}
          onCreateNewSession={() => createNewSession()}
          onSelectSession={switchSession}
          onDeleteSession={deleteSession}
        />
      </Sider>

      <Layout>
        <Content className="ai-main-content">
          <div className="ai-header">
            <RobotOutlined className="ai-icon" />
            <span className="ai-title">
              {currentSession ? currentSession.title : "AI 助手"}
            </span>
            <Tooltip title="AI 助手可以帮助你生成、分析和优化页面结构">
              <BulbOutlined className="help-icon" />
            </Tooltip>
          </div>

          <div className="ai-content">
            <div className="messages-container">
              {messages.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "#888",
                  }}
                >
                  <p>💡 开始一个新的对话吧！</p>
                  <p style={{ fontSize: "12px" }}>
                    描述你想要创建的页面，或者让 AI 优化现有设计
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`message ${message.type}`}>
                    {message.type === "loading" ? (
                      <LoadingOutlined className="loading-icon" />
                    ) : message.type === "error" ? (
                      <span className="error-message">
                        ❌ {message.content}
                      </span>
                    ) : (
                      <div className="message-content">
                        <div className="message-text">{message.content}</div>
                      </div>
                    )}
                    <div className="message-time">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <Divider className="divider" />

            <div className="quick-actions">
              <Space wrap>
                <Button
                  size="small"
                  onClick={() => handleQuickAction("生成一个登录页面")}
                >
                  登录页面
                </Button>
                <Button
                  size="small"
                  onClick={() => handleQuickAction("生成一个数据表格")}
                >
                  数据表格
                </Button>
                <Button
                  size="small"
                  onClick={() => handleQuickAction("优化当前页面布局")}
                >
                  优化布局
                </Button>
                <Button
                  size="small"
                  onClick={() => handleQuickAction("分析当前页面设计")}
                >
                  分析设计
                </Button>
              </Space>
            </div>

            <div className="input-area">
              <Input.TextArea
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setInputValue(e.target.value)
                }
                placeholder="描述你想要创建的页面，或者让 AI 优化现有设计..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                loading={loading}
                disabled={!inputValue.trim()}
              >
                发送
              </Button>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};
