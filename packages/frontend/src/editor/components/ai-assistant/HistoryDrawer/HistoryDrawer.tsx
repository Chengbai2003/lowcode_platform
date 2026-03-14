import React, { useEffect, useState } from 'react';
import {
  CloseOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  CopyOutlined,
  HistoryOutlined,
  DeleteOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { message, Popconfirm } from 'antd';
import { motion } from 'framer-motion';
import type { AISessionMeta, AISessionMessage, A2UISchema } from '../../../../types';
import { useEditorStore } from '../../../store';
import { useSessionManager } from '../../../hooks';
import styles from './HistoryDrawer.module.scss';

interface HistoryDrawerProps {
  onRollback?: (schema: A2UISchema | unknown) => boolean;
}

// 日期分组
type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

interface GroupedSessions {
  [key: string]: AISessionMeta[];
}

// 获取分组 - 按时间戳将会话分组为今天/昨天/本周/更早
const getDateGroup = (timestamp: number): DateGroup => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'thisWeek';
  return 'older';
};

const groupLabels: Record<DateGroup, string> = {
  today: '今天',
  yesterday: '昨天',
  thisWeek: '本周',
  older: '更早',
};

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ onRollback }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const isOpen = useEditorStore((state) => state.isHistoryDrawerOpen);
  const setHistoryDrawerOpen = useEditorStore((state) => state.setHistoryDrawerOpen);
  const {
    sessions,
    currentSession,
    isLoading,
    error,
    hasMoreSessions,
    loadSessions,
    loadMoreSessions,
    loadSession,
    deleteSession,
  } = useSessionManager({ pageSize: 20 });

  const selectedSession =
    selectedSessionId && currentSession?.id === selectedSessionId ? currentSession : null;

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      setSelectedSessionId(null);
    }
  }, [isOpen, loadSessions]);

  useEffect(() => {
    if (error && isOpen) {
      message.error(error);
    }
  }, [error, isOpen]);

  // 分组会话
  const groupedSessions: GroupedSessions = sessions.reduce((acc, session) => {
    const group = getDateGroup(session.updatedAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(session);
    return acc;
  }, {} as GroupedSessions);

  // 加载会话详情
  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const session = await loadSession(sessionId);
    if (!session) {
      message.error('加载会话详情失败');
    }
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    const ok = await deleteSession(sessionId);
    if (!ok) {
      message.error('删除会话失败');
      return;
    }
    if (selectedSession?.id === sessionId) {
      setSelectedSessionId(null);
    }
    message.success('会话已删除');
  };

  // 复制内容
  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    message.success('已复制到剪贴板');
  };

  // 回滚
  const handleRollback = (msg: AISessionMessage) => {
    if (msg.actionResult) {
      // 解析并回滚
      const ok = onRollback?.(msg.actionResult);
      if (ok) {
        message.success('已恢复到此版本');
        setHistoryDrawerOpen(false);
      }
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 关闭抽屉
  const handleClose = () => {
    setHistoryDrawerOpen(false);
    setSelectedSessionId(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 毛玻璃遮罩 */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleClose}
      />

      {/* 抽屉 */}
      <motion.div
        className={styles.drawer}
        role="dialog"
        aria-label="历史记录"
        initial={{ x: -400 }}
        animate={{ x: 0 }}
        exit={{ x: -400 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* 头部 */}
        <div className={styles.header}>
          {selectedSession ? (
            <>
              <button
                className={styles.backButton}
                onClick={() => setSelectedSessionId(null)}
                aria-label="返回列表"
              >
                <ArrowLeftOutlined />
              </button>
              <span className={styles.detailTitle}>{selectedSession.title}</span>
              <div className={styles.detailActions}>
                <Popconfirm
                  title="确定删除此会话？"
                  onConfirm={() => handleDeleteSession(selectedSession.id)}
                  okText="删除"
                  cancelText="取消"
                  zIndex={1072}
                >
                  <button className={`${styles.actionButton} ${styles.danger}`}>
                    <DeleteOutlined />
                  </button>
                </Popconfirm>
              </div>
            </>
          ) : (
            <>
              <span className={styles.title}>历史记录</span>
              <button className={styles.closeButton} onClick={handleClose} aria-label="关闭">
                <CloseOutlined />
              </button>
            </>
          )}
        </div>

        {/* 内容 */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <LoadingOutlined />
            </div>
          ) : selectedSession ? (
            /* 会话详情 */
            <div className={styles.messageList}>
              {selectedSession.messages.map((msg) => (
                <div key={msg.id} className={`${styles.messageBubble} ${styles[msg.role]}`}>
                  <div className={styles.messageRole}>
                    {msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统'}
                  </div>
                  <div className={styles.messageContent}>{msg.content}</div>
                  <div className={styles.messageTime}>{formatTime(msg.timestamp)}</div>
                  {msg.actionResult && (
                    <div className={styles.messageActions}>
                      <button className={styles.actionButton} onClick={() => handleRollback(msg)}>
                        <HistoryOutlined /> 恢复此版本
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleCopyContent(JSON.stringify(msg.actionResult, null, 2))}
                      >
                        <CopyOutlined /> 复制
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            /* 空状态 */
            <div className={styles.emptyState}>
              <InboxOutlined className={styles.emptyIcon} />
              <p className={styles.emptyText}>暂无历史记录</p>
              <p className={styles.emptyHint}>使用 Cmd+K 开始与 AI 对话</p>
            </div>
          ) : (
            /* 会话列表 */
            <>
              {(['today', 'yesterday', 'thisWeek', 'older'] as DateGroup[]).map(
                (group) =>
                  groupedSessions[group]?.length > 0 && (
                    <div key={group} className={styles.sessionGroup}>
                      <div className={styles.groupTitle}>{groupLabels[group]}</div>
                      {groupedSessions[group].map((session) => (
                        <div
                          key={session.id}
                          className={styles.sessionItem}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <div className={styles.sessionTitle}>{session.title}</div>
                          <div className={styles.sessionMeta}>
                            <span className={styles.sessionTime}>
                              <ClockCircleOutlined />
                              {formatTime(session.updatedAt)}
                            </span>
                            <span className={styles.sessionCount}>
                              <MessageOutlined />
                              {session.messageCount}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
              )}
              {hasMoreSessions && (
                <div className={styles.loadMore}>
                  <button className={styles.loadMoreButton} onClick={() => loadMoreSessions()}>
                    加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
};
