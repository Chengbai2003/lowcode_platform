import React from 'react';
import { Button, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { A2UISchema } from '../../../../types';
import type { AgentClarificationCandidate } from '../types/ai-types';
import type { AIMessage } from './AIAssistant.types';
import { MarkdownContent } from './MarkdownContent';
import styles from './AIAssistant.module.scss';

interface AIAssistantMessageListProps {
  messages: AIMessage[];
  onApplySchema: (schema: A2UISchema) => void;
  onApplyPatchPreview: (messageId: string) => Promise<boolean>;
  onResolveClarification: (
    messageId: string,
    candidateId: string,
    candidateLabel: string,
  ) => Promise<void>;
  busy: boolean;
  endRef: React.RefObject<HTMLDivElement>;
}

export const AIAssistantMessageList: React.FC<AIAssistantMessageListProps> = ({
  messages,
  onApplySchema,
  onApplyPatchPreview,
  onResolveClarification,
  busy,
  endRef,
}) => {
  const formatClarificationSelection = (candidate: AgentClarificationCandidate) =>
    candidate.pathLabel
      ? `${candidate.displayLabel}（${candidate.pathLabel}）`
      : candidate.displayLabel;

  const formatRoute = (message: AIMessage) => {
    if (!message.route) {
      return null;
    }

    return `${message.route.requestedMode.toUpperCase()} -> ${message.route.resolvedMode.toUpperCase()}`;
  };

  const riskColorMap = {
    low: 'green',
    medium: 'gold',
    high: 'red',
  } as const;

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

              {message.patchPreview && (
                <div className={styles.patchPreviewCard}>
                  <div className={styles.patchPreviewHeader}>
                    <span className={styles.patchPreviewTitle}>修改预览</span>
                    <Tag color={riskColorMap[message.patchPreview.risk.level]}>
                      {message.patchPreview.risk.level.toUpperCase()}
                    </Tag>
                  </div>
                  <div className={styles.patchPreviewMeta}>
                    <span>目标：{message.patchPreview.resolvedSelectedId ?? '未显式指定'}</span>
                    <span>Patch 数：{message.patchPreview.patch.length}</span>
                    <span>影响目标：{message.patchPreview.risk.distinctTargets}</span>
                  </div>
                  <div className={styles.patchReasonList}>
                    {message.patchPreview.risk.reasons.map((reason, index) => (
                      <div key={`${message.id}-risk-${index}`} className={styles.patchReasonItem}>
                        {reason}
                      </div>
                    ))}
                  </div>
                  <div className={styles.changeGroupList}>
                    {message.patchPreview.changeGroups.map((group) => (
                      <div key={`${message.id}-${group.kind}`} className={styles.changeGroup}>
                        <div className={styles.changeGroupHeader}>
                          <span>{group.label}</span>
                          <span>{group.count} 处</span>
                        </div>
                        <div className={styles.changeEntryList}>
                          {group.entries.map((entry, index) => (
                            <div
                              key={`${message.id}-${group.kind}-${entry.targetId}-${index}`}
                              className={styles.changeEntry}
                            >
                              {entry.summary}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {message.patchPreview.warnings.length > 0 && (
                    <div className={styles.patchWarningList}>
                      {message.patchPreview.warnings.map((warning, index) => (
                        <div key={`${message.id}-warning-${index}`} className={styles.patchWarning}>
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={styles.patchActions}>
                    <Button
                      type="primary"
                      size="small"
                      loading={message.applyState === 'applying'}
                      disabled={busy || message.applyState === 'applied'}
                      onClick={() => void onApplyPatchPreview(message.id)}
                    >
                      {message.applyState === 'applied'
                        ? '已应用'
                        : message.patchPreview.requiresConfirmation
                          ? '确认并应用'
                          : '应用修改'}
                    </Button>
                    {message.applyState === 'failed' && (
                      <Tag color="red" className={styles.inlineStatusTag}>
                        应用失败
                      </Tag>
                    )}
                    {message.applyState === 'applied' && (
                      <Tag color="green" className={styles.inlineStatusTag}>
                        已应用
                      </Tag>
                    )}
                  </div>
                </div>
              )}

              {message.clarification && (
                <div className={styles.clarificationCard}>
                  <div className={styles.clarificationTitle}>{message.clarification.question}</div>
                  <div className={styles.clarificationList}>
                    {message.clarification.candidates.map((candidate) => (
                      <button
                        key={`${message.id}-${candidate.id}`}
                        type="button"
                        className={styles.clarificationOption}
                        disabled={busy}
                        onClick={() =>
                          void onResolveClarification(
                            message.id,
                            candidate.id,
                            formatClarificationSelection(candidate),
                          )
                        }
                      >
                        <span className={styles.clarificationLabel}>{candidate.displayLabel}</span>
                        {candidate.secondaryLabel !== candidate.displayLabel && (
                          <span className={styles.clarificationMeta}>
                            {candidate.secondaryLabel}
                          </span>
                        )}
                        {candidate.pathLabel && (
                          <span className={styles.clarificationPath}>{candidate.pathLabel}</span>
                        )}
                        <span className={styles.clarificationReason}>
                          匹配依据：{candidate.reason}
                        </span>
                        <span className={styles.clarificationDebug}>ID: {candidate.id}</span>
                      </button>
                    ))}
                  </div>
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
