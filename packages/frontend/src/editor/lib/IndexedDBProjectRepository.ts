import {
  ProjectRepository,
  Project,
  ProjectMeta,
  AISession,
  AISessionMeta,
} from "../../types";
import { set, get, del } from "idb-keyval";

const PROJECT_META_KEY = "project_metas";
const SESSION_META_KEY = "session_metas";

export class IndexedDBProjectRepository implements ProjectRepository {
  async save(project: Project): Promise<void> {
    // 更新项目数据
    await set(`project_${project.meta.id}`, project);

    // 更新元数据列表
    const metas: ProjectMeta[] = (await get(PROJECT_META_KEY)) || [];
    const existingIndex = metas.findIndex(
      (meta) => meta.id === project.meta.id,
    );

    if (existingIndex >= 0) {
      metas[existingIndex] = project.meta;
    } else {
      metas.push(project.meta);
    }

    await set(PROJECT_META_KEY, metas);
  }

  async load(id: string): Promise<Project | null> {
    return (await get(`project_${id}`)) || null;
  }

  async list(): Promise<ProjectMeta[]> {
    return (await get(PROJECT_META_KEY)) || [];
  }

  async delete(id: string): Promise<void> {
    await del(`project_${id}`);

    // 从元数据列表中移除
    let metas: ProjectMeta[] = (await get(PROJECT_META_KEY)) || [];
    metas = metas.filter((meta) => meta.id !== id);
    await set(PROJECT_META_KEY, metas);
  }

  async exists(id: string): Promise<boolean> {
    const project = await this.load(id);
    return project !== null;
  }

  async export(id: string): Promise<string> {
    const project = await this.load(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    return JSON.stringify(project, null, 2);
  }

  async import(data: string): Promise<Project> {
    const project: Project = JSON.parse(data);
    await this.save(project);
    return project;
  }

  // 会话管理方法
  async saveSession(session: AISession): Promise<void> {
    try {
      // 更新会话数据
      await set(`session_${session.id}`, session);

      // 更新会话元数据列表
      const sessionMetas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      const existingIndex = sessionMetas.findIndex(
        (meta) => meta.id === session.id,
      );

      // 从 session 中提取元数据（不包含 messages）
      const { messages, ...meta } = session;

      if (existingIndex >= 0) {
        // 更新现有元数据
        sessionMetas[existingIndex] = meta;
      } else {
        // 添加新元数据
        sessionMetas.push(meta);
      }

      await set(SESSION_META_KEY, sessionMetas);
    } catch (error) {
      console.error("Failed to save session:", error);
      throw error;
    }
  }

  async loadSession(sessionId: string): Promise<AISession | null> {
    try {
      return (await get(`session_${sessionId}`)) || null;
    } catch (error) {
      console.error("Failed to load session:", error);
      return null;
    }
  }

  async listSessions(projectId?: string): Promise<AISessionMeta[]> {
    try {
      let sessionMetas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];

      // 如果指定了 projectId，则过滤出关联该项目的会话
      if (projectId) {
        sessionMetas = sessionMetas.filter(
          (meta) => meta.projectId === projectId,
        );
      }

      // 按更新时间倒序排列
      return sessionMetas.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error("Failed to list sessions:", error);
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await del(`session_${sessionId}`);

      // 从会话元数据列表中移除
      let sessionMetas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];
      sessionMetas = sessionMetas.filter((meta) => meta.id !== sessionId);
      await set(SESSION_META_KEY, sessionMetas);
    } catch (error) {
      console.error("Failed to delete session:", error);
      throw error;
    }
  }

  async clearOldSessions(maxAgeDays: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      let sessionMetas: AISessionMeta[] = (await get(SESSION_META_KEY)) || [];

      // 找出需要删除的会话 ID
      const sessionsToDelete = sessionMetas.filter(
        (meta) => meta.updatedAt < cutoffTime,
      );

      // 删除会话数据
      for (const sessionMeta of sessionsToDelete) {
        await del(`session_${sessionMeta.id}`);
      }

      // 更新元数据列表
      sessionMetas = sessionMetas.filter(
        (meta) => meta.updatedAt >= cutoffTime,
      );
      await set(SESSION_META_KEY, sessionMetas);
    } catch (error) {
      console.error("Failed to clear old sessions:", error);
      throw error;
    }
  }
}
