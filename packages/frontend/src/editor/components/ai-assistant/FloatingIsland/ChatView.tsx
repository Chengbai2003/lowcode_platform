import React from "react";
import {
  Bot,
  ArrowUp,
  History,
  Database,
  Loader2,
  XCircle,
  Target,
} from "lucide-react";
import { Dropdown } from "antd";
import type { AIModelConfig } from "../types/ai-types";
import styles from "./FloatingIsland.module.scss";

interface ChatViewProps {
  inputValue: string;
  isLoading: boolean;
  models: AIModelConfig[];
  currentModelName: string;
  hasSelectedComponents: boolean;
  formattedContext: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onShowHistory: () => void;
  onClearSelection: () => void;
  onSelectModel: (modelId: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  inputValue,
  isLoading,
  models,
  currentModelName,
  hasSelectedComponents,
  formattedContext,
  onInputChange,
  onSend,
  onShowHistory,
  onClearSelection,
  onSelectModel,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
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
    onClick: () => onSelectModel(model.id),
  }));

  return (
    <>
      {/* 上下文标签 */}
      {hasSelectedComponents && (
        <div className={styles.contextChip}>
          <Target size={14} className={styles.contextIcon} />
          <span className={styles.contextText}>{formattedContext}</span>
          <button
            className={styles.clearContext}
            onClick={onClearSelection}
            aria-label="清除选择"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* 聊天内容 */}
      <div className={styles.chatView}>
        <div className={styles.messageRow}>
          <div className={styles.avatar}>
            <Bot size={16} />
          </div>
          <div className={styles.messageBubble}>
            我已经为您生成了登录页面。您还可以让我修改样式，比如"把按钮变成圆角"，或者"添加一个忘记密码的链接"。
          </div>
        </div>
      </div>

      {/* 输入区域 */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <button
            className={styles.historyToggle}
            title="历史记录"
            onClick={onShowHistory}
          >
            <History size={16} />
          </button>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={inputValue}
              onChange={(e) => {
                onInputChange(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="描述你想要的修改，或让 AI 优化现有设计..."
              rows={2}
              disabled={isLoading}
              aria-label="输入你的问题"
            />
            <button
              className={`${styles.sendButton} ${!inputValue.trim() || isLoading ? styles.disabled : ""}`}
              onClick={onSend}
              disabled={!inputValue.trim() || isLoading}
              aria-label="发送消息"
            >
              {isLoading ? (
                <Loader2 size={14} className={styles.spin} />
              ) : (
                <ArrowUp size={14} />
              )}
            </button>
          </div>
        </div>
        <div className={styles.inputFooter}>
          <Dropdown menu={{ items: modelMenuItems }} trigger={["click"]}>
            <button className={styles.modelButton} type="button">
              <Database size={14} />
              <span>{currentModelName}</span>
            </button>
          </Dropdown>
        </div>
      </div>
    </>
  );
};
