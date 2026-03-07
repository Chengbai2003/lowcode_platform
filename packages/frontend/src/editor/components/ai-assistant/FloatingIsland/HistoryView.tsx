import React from "react";
import { History, Loader2, MessageSquare, Clock, Bot } from "lucide-react";
import type { AISession } from "../../../../types";
import styles from "./FloatingIsland.module.scss";

/**
 * 格式化时间显示
 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (diffDays === 1) {
    return "昨天";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("zh-CN", { weekday: "short" });
  } else {
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
};

interface HistoryViewProps {
  sessions: AISession[];
  isLoading: boolean;
  onSelectSession: (session: AISession) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  isLoading,
  onSelectSession,
}) => {
  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <Loader2 size={24} className={styles.spin} />
        <span>加载中...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <History size={24} />
        <span>暂无历史记录</span>
      </div>
    );
  }

  return (
    <div className={styles.sessionList}>
      {sessions.map((session) => (
        <button
          key={session.id}
          className={styles.sessionItem}
          onClick={() => onSelectSession(session)}
        >
          <div className={styles.sessionHeader}>
            <span className={styles.sessionTitle}>
              <MessageSquare size={14} className={styles.sessionIcon} />
              {session.title}
            </span>
            <span className={styles.sessionTime}>
              <Clock size={12} />
              {formatTime(session.updatedAt)}
            </span>
          </div>
          <p className={styles.sessionPreview}>{session.lastMessageContent}</p>
        </button>
      ))}
    </div>
  );
};

interface DetailViewProps {
  session: AISession;
}

export const DetailView: React.FC<DetailViewProps> = ({ session }) => {
  return (
    <div className={styles.detailView}>
      <div className={styles.messageList}>
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageRow} ${styles[msg.role]}`}
          >
            <div className={`${styles.avatar} ${styles[msg.role]}`}>
              {msg.role === "user" ? (
                <span className={styles.userAvatar}>U</span>
              ) : (
                <Bot size={16} />
              )}
            </div>
            <div className={`${styles.messageBubble} ${styles[msg.role]}`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { formatTime };
