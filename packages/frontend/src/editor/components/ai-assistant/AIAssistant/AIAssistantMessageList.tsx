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
  return (
    <div className={styles.messagesContainer}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`${styles.message} ${styles[`message${message.type.charAt(0).toUpperCase() + message.type.slice(1)}`]}`}
        >
          {message.status === 'loading' ? (
            <LoadingOutlined className={styles.loadingIcon} />
          ) : message.status === 'error' ? (
            <span className={styles.errorMessage}>❌ {message.content}</span>
          ) : (
            <div className={styles.messageContent}>
              <div className={styles.messageText}>
                <MarkdownContent content={message.content} />
              </div>

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
