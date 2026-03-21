import React from 'react';
import { Button, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { A2UISchema } from '../../../../types';
import type { AIMessage } from './AIAssistant.types';
import { MarkdownContent } from './MarkdownContent';
import styles from './AIAssistant.module.scss';

interface AIAssistantMessageListProps {
  messages: AIMessage[];
  onApplySchema: (schema: A2UISchema) => void;
  endRef: React.RefObject<HTMLDivElement>;
}

export const AIAssistantMessageList: React.FC<AIAssistantMessageListProps> = ({
  messages,
  onApplySchema,
  endRef,
}) => {
  const formatRoute = (message: AIMessage) => {
    if (!message.route) {
      return null;
    }

    return `${message.route.requestedMode.toUpperCase()} -> ${message.route.resolvedMode.toUpperCase()}`;
  };

  return (
    <div className={styles.messagesContainer}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`${styles.message} ${styles[`message${message.type.charAt(0).toUpperCase() + message.type.slice(1)}`]}`}
        >
          {message.status === 'error' ? (
            <span className={styles.errorMessage}>❌ {message.content}</span>
          ) : (
            <div className={styles.messageContent}>
              {message.status === 'loading' && (
                <div className={styles.progressHeader}>
                  <LoadingOutlined className={styles.loadingIcon} />
                  <span>{message.progress?.label ?? '正在处理中...'}</span>
                </div>
              )}

              {(message.route || message.progress || message.traceId) && (
                <div className={styles.progressPanel}>
                  {message.route && (
                    <div className={styles.progressRow}>
                      <span className={styles.progressLabel}>模式</span>
                      <span>{formatRoute(message)}</span>
                    </div>
                  )}
                  {message.progress && (
                    <div className={styles.progressRow}>
                      <span className={styles.progressLabel}>阶段</span>
                      <span>{message.progress.label}</span>
                    </div>
                  )}
                  {message.progress?.toolName && (
                    <div className={styles.progressRow}>
                      <span className={styles.progressLabel}>工具</span>
                      <span>{message.progress.toolName}</span>
                    </div>
                  )}
                  {(message.traceId || message.progress?.traceId) && (
                    <div className={styles.progressRow}>
                      <span className={styles.progressLabel}>Trace</span>
                      <span>{message.traceId ?? message.progress?.traceId}</span>
                    </div>
                  )}
                </div>
              )}

              {message.content && (
                <div className={styles.messageText}>
                  <MarkdownContent content={message.content} />
                </div>
              )}

              {message.modelUsed && (
                <div className={styles.modelIndicator}>
                  <span className={styles.modelLabel}>模型: {message.modelUsed}</span>
                </div>
              )}

              {message.suggestions && message.suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <div className={styles.suggestionsTitle}>💡 建议：</div>
                  {message.suggestions.map((suggestion, index) => (
                    <Tag key={index} className={styles.suggestionTag}>
                      {suggestion}
                    </Tag>
                  ))}
                </div>
              )}

              {message.schema && (
                <div className={styles.schemaActions}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => onApplySchema(message.schema!)}
                  >
                    应用此Schema
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className={styles.messageTime}>{message.timestamp.toLocaleTimeString()}</div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};
