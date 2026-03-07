import React, { useEffect, useState, useCallback, useRef } from "react";
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
} from "@ant-design/icons";
import { message, Popconfirm } from "antd";
import type {
  AISession,
  AISessionMeta,
  AISessionMessage,
} from "../../../../types";
import { useEditorStore } from "../../../store";
import { sessionRepository } from "../../../store/db/session-repository";
import styles from "./HistoryDrawer.module.css";

interface HistoryDrawerProps {
  onRollback?: (schema: any) => void;
}

// 日期分组
type DateGroup = "today" | "yesterday" | "thisWeek" | "older";

interface GroupedSessions {
  [key: string]: AISessionMeta[];
}

// 获取分组
const getDateGroup = (timestamp: number): DateGroup => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "thisWeek";
  return "older";
};

const groupLabels: Record<DateGroup, string> = {
  today: "今天",
  yesterday: "昨天",
  thisWeek: "本周",
  older: "更早",
};

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ onRollback }) => {
  const [sessions, setSessions] = useState<AISessionMeta[]>([]);
  const [selectedSession, setSelectedSession] = useState<AISession | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  const isOpen = useEditorStore((state) => state.isHistoryDrawerOpen);
  const setHistoryDrawerOpen = useEditorStore(
    (state) => state.setHistoryDrawerOpen,
  );
  const removeSession = useEditorStore((state) => state.removeSession);

  // 清理 ref
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionList = await sessionRepository.listSessions();
      // 检查组件是否仍然挂载
      if (isMountedRef.current) {
        setSessions(sessionList);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      if (isMountedRef.current) {
        message.error("加载会话列表失败");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      setSelectedSession(null);
    }
  }, [isOpen, loadSessions]);

  // 分组会话
  const groupedSessions: GroupedSessions = sessions.reduce((acc, session) => {
    const group = getDateGroup(session.updatedAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(session);
    return acc;
  }, {} as GroupedSessions);

  // 加载会话详情
  const handleSelectSession = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const session = await sessionRepository.getSession(sessionId);
      if (session && isMountedRef.current) {
        setSelectedSession(session);
      }
    } catch (error) {
      console.error("Failed to load session:", error);
      if (isMountedRef.current) {
        message.error("加载会话详情失败");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await sessionRepository.deleteSession(sessionId);
      removeSession(sessionId);
      if (isMountedRef.current) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
        }
      }
      message.success("会话已删除");
    } catch (error) {
      console.error("Failed to delete session:", error);
      message.error("删除会话失败");
    }
  };

  // 复制内容
  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    message.success("已复制到剪贴板");
  };

  // 回滚
  const handleRollback = (msg: AISessionMessage) => {
    if (msg.actionResult) {
      // 解析并回滚
      onRollback?.(msg.actionResult);
      message.success("已恢复到此版本");
      setHistoryDrawerOpen(false);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <div className={styles.drawer} role="dialog" aria-label="历史记录">
      {/* 头部 */}
      <div className={styles.header}>
        {selectedSession ? (
          <>
            <button
              className={styles.backButton}
              onClick={() => setSelectedSession(null)}
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
            <button
              className={styles.closeButton}
              onClick={() => setHistoryDrawerOpen(false)}
              aria-label="关闭"
            >
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
              <div
                key={msg.id}
                className={`${styles.messageBubble} ${styles[msg.role]}`}
              >
                <div className={styles.messageRole}>
                  {msg.role === "user"
                    ? "用户"
                    : msg.role === "assistant"
                      ? "AI"
                      : "系统"}
                </div>
                <div className={styles.messageContent}>{msg.content}</div>
                <div className={styles.messageTime}>
                  {formatTime(msg.timestamp)}
                </div>
                {msg.actionResult && (
                  <div className={styles.messageActions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => handleRollback(msg)}
                    >
                      <HistoryOutlined /> 恢复此版本
                    </button>
                    <button
                      className={styles.actionButton}
                      onClick={() =>
                        handleCopyContent(
                          JSON.stringify(msg.actionResult, null, 2),
                        )
                      }
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
          (["today", "yesterday", "thisWeek", "older"] as DateGroup[]).map(
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
          )
        )}
      </div>
    </div>
  );
};
