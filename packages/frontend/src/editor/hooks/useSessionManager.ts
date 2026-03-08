import { useState, useEffect, useCallback } from 'react';
import { AISession, AISessionMessage, AISessionMeta } from '../../types';
import { IndexedDBProjectRepository } from '../lib/IndexedDBProjectRepository';

// 生成会话标题的辅助函数
export function generateSessionTitle(content: string): string {
  // 截取前 30 个字符作为标题，如果超过则添加省略号
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return '新会话';
  }
  return trimmedContent.length > 30 ? trimmedContent.substring(0, 30) + '...' : trimmedContent;
}

// 生成安全的会话 ID
function generateSessionId(): string {
  // 使用 crypto.randomUUID() 如果可用，否则使用 Date.now + 随机数
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `session_${crypto.randomUUID()}`;
  }
  // Fallback: 使用 Date.now + substring (substr 已废弃)
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

interface UseSessionManagerProps {
  projectId?: string;
}

export const useSessionManager = ({ projectId }: UseSessionManagerProps) => {
  const [sessions, setSessions] = useState<AISessionMeta[]>([]);
  const [currentSession, setCurrentSession] = useState<AISession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 IndexedDB Repository
  const repository = new IndexedDBProjectRepository();

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sessionList = await repository.listSessions(projectId);
      setSessions(sessionList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载会话失败';
      setError(errorMessage);
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 创建新会话
  const createNewSession = useCallback(
    async (firstMessage?: string) => {
      const sessionId = generateSessionId();
      const now = Date.now();

      const newSession: AISession = {
        id: sessionId,
        title: firstMessage ? generateSessionTitle(firstMessage) : '新会话',
        projectId,
        createdAt: now,
        updatedAt: now,
        messageCount: firstMessage ? 1 : 0,
        lastMessageContent: firstMessage || '',
        lastMessageTimestamp: firstMessage ? now : 0,
        messages: firstMessage
          ? [
              {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: firstMessage,
                timestamp: now,
              },
            ]
          : [],
      };

      setCurrentSession(newSession);

      // 保存到 IndexedDB
      try {
        await repository.saveSession(newSession);
        // 重新加载会话列表
        await loadSessions();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '创建会话失败';
        setError(errorMessage);
        console.error('Failed to create session:', err);
      }
    },
    [projectId, loadSessions],
  );

  // 加载特定会话
  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await repository.loadSession(sessionId);
      if (session) {
        setCurrentSession(session);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载会话失败';
      setError(errorMessage);
      console.error('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 切换到特定会话
  const switchSession = useCallback(
    async (sessionId: string) => {
      await loadSession(sessionId);
    },
    [loadSession],
  );

  // 保存当前会话
  const saveCurrentSession = useCallback(async () => {
    if (!currentSession) return;

    try {
      await repository.saveSession(currentSession);
      // 重新加载会话列表
      await loadSessions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存会话失败';
      setError(errorMessage);
      console.error('Failed to save session:', err);
    }
  }, [currentSession, loadSessions]);

  // 更新当前会话的消息
  const updateCurrentSessionMessages = useCallback(
    (messages: AISessionMessage[]) => {
      if (!currentSession) return;

      const now = Date.now();
      const lastMessage = messages[messages.length - 1];

      const updatedSession: AISession = {
        ...currentSession,
        messages,
        messageCount: messages.length,
        lastMessageContent: lastMessage?.content || '',
        lastMessageTimestamp: lastMessage?.timestamp || now,
        updatedAt: now,
      };

      setCurrentSession(updatedSession);

      // 异步保存到 IndexedDB
      repository.saveSession(updatedSession).catch((err) => {
        console.error('Failed to auto-save session:', err);
      });
    },
    [currentSession],
  );

  // 删除会话
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await repository.deleteSession(sessionId);
        // 从本地状态移除会话
        setSessions((prev) => prev.filter((session) => session.id !== sessionId));

        // 如果删除的是当前会话，则清空当前会话
        if (currentSession && currentSession.id === sessionId) {
          setCurrentSession(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '删除会话失败';
        setError(errorMessage);
        console.error('Failed to delete session:', err);
      }
    },
    [currentSession],
  );

  // 初始化时加载会话列表
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    currentSession,
    isLoading,
    error,
    createNewSession,
    switchSession,
    loadSession,
    saveCurrentSession,
    updateCurrentSessionMessages,
    deleteSession,
    loadSessions,
  };
};
