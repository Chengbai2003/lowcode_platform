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
import { motion } from "framer-motion";
import type {
  AISession,
  AISessionMeta,
  AISessionMessage,
  A2UISchema,
} from "../../../../types";
import { useEditorStore } from "../../../store";
import styles from "./HistoryDrawer.module.scss";

interface HistoryDrawerProps {
  onRollback?: (schema: A2UISchema | unknown) => void;
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

// Mock 数据 - 用于测试
const mockSessions: AISessionMeta[] = [
  {
    id: "1",
    title: "创建登录页面",
    createdAt: Date.now() - 1000 * 60 * 30, // 30 分钟前
    updatedAt: Date.now() - 1000 * 60 * 30,
    messageCount: 5,
    lastMessageContent: "添加一个'忘记密码？'的链接",
    lastMessageTimestamp: Date.now() - 1000 * 60 * 30,
  },
  {
    id: "2",
    title: "修改按钮样式",
    createdAt: Date.now() - 1000 * 60 * 60 * 2, // 2 小时前
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
    messageCount: 3,
    lastMessageContent: "好的，谢谢",
    lastMessageTimestamp: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: "3",
    title: "添加用户注册表单",
    createdAt: Date.now() - 1000 * 60 * 60 * 24, // 昨天
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    messageCount: 8,
    lastMessageContent: "已创建用户注册表单",
    lastMessageTimestamp: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: "4",
    title: "优化导航栏布局",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 天前
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    messageCount: 6,
    lastMessageContent: "导航栏布局已优化",
    lastMessageTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
  {
    id: "5",
    title: "创建数据表格页面",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 天前
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
    messageCount: 12,
    lastMessageContent: "数据表格已创建完成",
    lastMessageTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 10,
  },
];

const mockSessionDetails: Record<string, AISessionMessage[]> = {
  "1": [
    {
      id: "1-1",
      role: "user",
      content: "帮我创建一个登录页面，包含用户名、密码输入框和登录按钮",
      timestamp: Date.now() - 1000 * 60 * 35,
    },
    {
      id: "1-2",
      role: "assistant",
      content: "好的，我已经为您创建了一个登录页面。包含以下元素：\n\n1. 页面容器\n2. 登录表单\n3. 用户名输入框（id: username）\n4. 密码输入框（id: password）\n5. 登录按钮（id: loginBtn）\n\n您可以对我说'修改按钮颜色'或'添加一个忘记密码链接'等来调整样式。",
      timestamp: Date.now() - 1000 * 60 * 34,
    },
    {
      id: "1-3",
      role: "user",
      content: "把按钮改成圆角的",
      timestamp: Date.now() - 1000 * 60 * 33,
    },
    {
      id: "1-4",
      role: "assistant",
      content: "已修改按钮样式，现在它是圆角的。我还做了以下优化：\n\n1. 添加了悬停效果\n2. 调整了内边距让按钮更舒适\n3. 使用了主题色作为背景",
      timestamp: Date.now() - 1000 * 60 * 32,
    },
    {
      id: "1-5",
      role: "user",
      content: "添加一个'忘记密码？'的链接",
      timestamp: Date.now() - 1000 * 60 * 30,
    },
  ],
  "2": [
    {
      id: "2-1",
      role: "user",
      content: "把所有的主要按钮都改成蓝色",
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
    },
    {
      id: "2-2",
      role: "assistant",
      content: "已将所有主要按钮的颜色改为蓝色。使用主题色系统中的 primary 颜色（#1890ff）。",
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
    },
    {
      id: "2-3",
      role: "user",
      content: "好的，谢谢",
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
    },
  ],
  "3": [
    {
      id: "3-1",
      role: "user",
      content: "创建一个用户注册表单",
      timestamp: Date.now() - 1000 * 60 * 60 * 24,
    },
    {
      id: "3-2",
      role: "assistant",
      content: "已创建用户注册表单，包含以下字段：\n\n1. 用户名\n2. 邮箱\n3. 密码\n4. 确认密码\n5. 注册按钮",
      timestamp: Date.now() - 1000 * 60 * 60 * 24,
    },
  ],
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

  // 加载会话列表（使用 mock 数据）
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      // 使用 mock 数据
      if (isMountedRef.current) {
        setSessions(mockSessions);
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

  // 加载会话详情（使用 mock 数据）
  const handleSelectSession = async (sessionId: string) => {
    setIsLoading(true);
    try {
      // 从 mock 数据中获取详情
      const messages = mockSessionDetails[sessionId] || [];
      const sessionMeta = mockSessions.find((s) => s.id === sessionId);
      if (isMountedRef.current && sessionMeta) {
        setSelectedSession({
          ...sessionMeta,
          messages,
        });
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
      // TODO: 实现 sessionRepository API 调用
      // await sessionRepository.deleteSession(sessionId);
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

  // 关闭抽屉
  const handleClose = () => {
    setHistoryDrawerOpen(false);
    setSelectedSession(null);
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
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
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
              <button
                className={styles.closeButton}
                onClick={handleClose}
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
      </motion.div>
    </>
  );
};
