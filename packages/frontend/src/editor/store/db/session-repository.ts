import { set, get, del } from 'idb-keyval';
import type {
  AISession,
  AISessionMeta,
  AISessionRepository,
  SessionListOptions,
} from '../../../types';

const SESSION_META_KEY = 'session_metas';

/**
 * IndexedDB 会话仓库实现
 * 使用 idb-keyval 进行简单的键值存储
 */
export class IndexedDBSessionRepository implements AISessionRepository {
  /**
   * 创建新会话
   */
  async createSession(session: AISession): Promise<void> {
    try {
      await set(`session_${session.id}`, session);

      const metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      const { messages, ...meta } = session;
      metas.unshift(meta);
      await set(SESSION_META_KEY, metas);
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * 获取单个会话
   */
  async getSession(sessionId: string): Promise<AISession | null> {
    try {
      return (await get(`session_${sessionId}`)) || null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * 获取项目的所有会话
   */
  async getSessionsByProject(projectId: string): Promise<AISession[]> {
    try {
      const metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      const filteredMetas = metas.filter((m) => m.projectId === projectId);
      const sessions: AISession[] = [];

      for (const meta of filteredMetas) {
        const session = await this.getSession(meta.id);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to get sessions by project:', error);
      return [];
    }
  }

  /**
   * 添加消息到会话
   */
  async addMessage(sessionId: string, message: AISession['messages'][0]): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      session.messages.push(message);
      session.messageCount = session.messages.length;
      session.lastMessageContent = message.content;
      session.lastMessageTimestamp = message.timestamp;
      session.updatedAt = Date.now();

      await set(`session_${sessionId}`, session);

      // 更新元数据
      const metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      const index = metas.findIndex((m) => m.id === sessionId);
      if (index >= 0) {
        metas[index] = {
          id: session.id,
          title: session.title,
          projectId: session.projectId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messageCount,
          lastMessageContent: session.lastMessageContent,
          lastMessageTimestamp: session.lastMessageTimestamp,
        };
        await set(SESSION_META_KEY, metas);
      }
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  }

  /**
   * 更新会话
   */
  async updateSession(update: Partial<AISession> & { id: string }): Promise<void> {
    try {
      const session = await this.getSession(update.id);
      if (!session) {
        throw new Error(`Session ${update.id} not found`);
      }

      const updatedSession = { ...session, ...update, updatedAt: Date.now() };
      await set(`session_${update.id}`, updatedSession);

      // 更新元数据
      const metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      const index = metas.findIndex((m) => m.id === update.id);
      if (index >= 0) {
        const { messages, ...meta } = updatedSession;
        metas[index] = meta;
        await set(SESSION_META_KEY, metas);
      }
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await del(`session_${sessionId}`);

      let metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      metas = metas.filter((m) => m.id !== sessionId);
      await set(SESSION_META_KEY, metas);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * 列出所有会话元数据
   */
  async listSessions(projectId?: string, options?: SessionListOptions): Promise<AISessionMeta[]> {
    try {
      let metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];

      if (projectId) {
        metas = metas.filter((m) => m.projectId === projectId);
      }

      const sorted = metas.sort((a, b) => b.updatedAt - a.updatedAt);
      if (!options) return sorted;
      const offset = Math.max(0, options.offset ?? 0);
      const limit = options.limit;
      if (limit === undefined) {
        return sorted.slice(offset);
      }
      return sorted.slice(offset, offset + limit);
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * 清理旧会话
   */
  async clearOldSessions(maxAgeDays: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      let metas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];

      const toDelete = metas.filter((m) => m.updatedAt < cutoffTime);

      for (const meta of toDelete) {
        await del(`session_${meta.id}`);
      }

      metas = metas.filter((m) => m.updatedAt >= cutoffTime);
      await set(SESSION_META_KEY, metas);
    } catch (error) {
      console.error('Failed to clear old sessions:', error);
      throw error;
    }
  }
}

// 单例导出
export const sessionRepository = new IndexedDBSessionRepository();
