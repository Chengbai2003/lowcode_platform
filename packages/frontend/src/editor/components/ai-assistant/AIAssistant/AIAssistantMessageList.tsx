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
  onConfirmScope: (messageId: string) => Promise<void>;
  onCancelScopeHighlight: () => void;
  onRestoreScopeHighlight: (messageId: string) => void;
  activeScopeSourceMessageId: string | null;
  busy: boolean;
  endRef: React.RefObject<HTMLDivElement>;
}

export const AIAssistantMessageList: React.FC<AIAssistantMessageListProps> = ({
  messages,
  onApplySchema,
  onApplyPatchPreview,
  onResolveClarification,
  onConfirmScope,
  onCancelScopeHighlight,
  onRestoreScopeHighlight,
  activeScopeSourceMessageId,
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

  const formatScopeState = (messageId: string) =>
    activeScopeSourceMessageId === messageId
      ? '画布中已显示本次批量范围'
      : '高亮已隐藏，但这次范围确认仍然有效';

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
                  {message.patchPreview.scopeSummary ? (
                    <div className={styles.batchPatchFlowHeader}>
                      <div className={styles.batchPatchFlowCopy}>
                        <span className={styles.batchPatchFlowEyebrow}>批量修改预览</span>
                        <span className={styles.patchPreviewTitle}>
                          第 2 步：确认即将应用的修改
                        </span>
                        <span className={styles.batchPatchFlowDescription}>
                          范围已经确认，下面展示这批组件将被统一修改的内容。
                        </span>
                      </div>
                      <div className={styles.batchPatchFlowMeta}>
                        <Tag color="cyan">范围已确认</Tag>
                        <Tag color={riskColorMap[message.patchPreview.risk.level]}>
                          {message.patchPreview.risk.level.toUpperCase()}
                        </Tag>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.patchPreviewHeader}>
                      <span className={styles.patchPreviewTitle}>修改预览</span>
                      <Tag color={riskColorMap[message.patchPreview.risk.level]}>
                        {message.patchPreview.risk.level.toUpperCase()}
                      </Tag>
                    </div>
                  )}
                  <div className={styles.patchPreviewMeta}>
                    <span>目标：{message.patchPreview.resolvedSelectedId ?? '未显式指定'}</span>
                    <span>Patch 数：{message.patchPreview.patch.length}</span>
                    <span>影响目标：{message.patchPreview.risk.distinctTargets}</span>
                    {message.patchPreview.scopeSummary && <span>批量范围已锁定</span>}
                  </div>
                  {message.patchPreview.scopeSummary && (
                    <div className={styles.scopeSummaryBar}>
                      <span className={styles.scopeSummaryLabel}>批量摘要</span>
                      <div className={styles.scopeSummaryStats}>
                        <span className={styles.scopeSummaryChip}>
                          {message.patchPreview.scopeSummary.targetCount} 个
                          {message.patchPreview.scopeSummary.matchedDisplayName}
                        </span>
                        <span className={styles.scopeSummaryChip}>
                          本次实际变更 {message.patchPreview.scopeSummary.changedTargetCount} 个
                        </span>
                      </div>
                    </div>
                  )}
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
                  {message.patchPreview.scopeSummary && (
                    <div className={styles.patchActionHint}>
                      应用后会一次性更新
                      {message.patchPreview.scopeSummary.changedTargetCount}{' '}
                      个目标组件，并继续走现有 undo / redo 机制。
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
                          : message.patchPreview.scopeSummary
                            ? '应用这批修改'
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

              {message.scopeConfirmation && (
                <div className={styles.scopeConfirmationCard}>
                  <div className={styles.scopeConfirmationHeader}>
                    <span className={styles.scopeConfirmationEyebrow}>批量范围确认</span>
                    <Tag color={activeScopeSourceMessageId === message.id ? 'cyan' : 'default'}>
                      {activeScopeSourceMessageId === message.id ? '画布已高亮' : '高亮已隐藏'}
                    </Tag>
                  </div>
                  <div className={styles.scopeConfirmationStep}>
                    第 1 步：确认范围；第 2 步：生成修改预览
                  </div>
                  <div className={styles.scopeConfirmationTitle}>
                    {message.scopeConfirmation.question}
                  </div>
                  <div className={styles.scopeConfirmationDescription}>
                    {formatScopeState(message.id)}
                  </div>
                  <div className={styles.scopeLegend}>
                    <span className={styles.scopeLegendItem}>
                      <span className={`${styles.scopeLegendSwatch} ${styles.scopeLegendRoot}`} />
                      琥珀色虚线表示当前批量范围容器
                    </span>
                    <span className={styles.scopeLegendItem}>
                      <span className={`${styles.scopeLegendSwatch} ${styles.scopeLegendTarget}`} />
                      青色虚线表示即将被统一修改的目标组件
                    </span>
                  </div>
                  <div className={styles.scopeConfirmationGrid}>
                    <div className={styles.scopeInfoBlock}>
                      <span className={styles.scopeInfoLabel}>当前容器</span>
                      <span className={styles.scopeInfoValue}>
                        {message.scopeConfirmation.scope.rootId}
                      </span>
                    </div>
                    <div className={styles.scopeInfoBlock}>
                      <span className={styles.scopeInfoLabel}>目标类型</span>
                      <span className={styles.scopeInfoValue}>
                        {message.scopeConfirmation.scope.matchedDisplayName}
                      </span>
                    </div>
                    <div className={styles.scopeInfoBlock}>
                      <span className={styles.scopeInfoLabel}>命中数量</span>
                      <span className={styles.scopeInfoValue}>
                        {message.scopeConfirmation.scope.targetCount} 个组件
                      </span>
                    </div>
                  </div>
                  <div className={styles.scopeActionHint}>
                    只有在你确认范围后，AI 才会生成 patch
                    预览。隐藏高亮只影响视觉提示，不会让这次确认失效。
                  </div>
                  <div className={styles.scopeConfirmationHint}>
                    组件树仍保持原始选中状态，这里只是额外叠加了一层 AI 范围预览。
                  </div>
                  {message.scopeConfirmation.warnings.length > 0 && (
                    <div className={styles.patchWarningList}>
                      {message.scopeConfirmation.warnings.map((warning, index) => (
                        <div
                          key={`${message.id}-scope-warning-${index}`}
                          className={styles.patchWarning}
                        >
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={styles.patchActions}>
                    <Button
                      type="primary"
                      size="middle"
                      disabled={busy}
                      onClick={() => void onConfirmScope(message.id)}
                    >
                      确认范围并生成预览
                    </Button>
                    {activeScopeSourceMessageId === message.id ? (
                      <Button size="middle" disabled={busy} onClick={onCancelScopeHighlight}>
                        暂时隐藏高亮
                      </Button>
                    ) : (
                      <Button
                        size="middle"
                        disabled={busy}
                        onClick={() => onRestoreScopeHighlight(message.id)}
                      >
                        重新高亮范围
                      </Button>
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
