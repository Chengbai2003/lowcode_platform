// AI 角色类型
export type AIRole = "user" | "assistant" | "system";

// AI 消息上下文 - 用户发送消息时的状态快照
export interface AIMessageContext {
  selectedComponentIds?: string[];
  currentRootId?: string;
}

// 组件更新记录
export interface ComponentUpdate {
  componentId: string;
  props: Record<string, unknown>;
  previousProps?: Record<string, unknown>;
  type?: string;
}

// AI 消息执行结果
export interface AIMessageActionResult {
  type:
    | "component_update"
    | "component_add"
    | "component_delete"
    | "batch_update";
  updates?: ComponentUpdate[];
  componentId?: string;
  props?: Record<string, unknown>;
  previousProps?: Record<string, unknown>;
}

// AI 会话消息
export interface AISessionMessage {
  id: string;
  role: AIRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  context?: AIMessageContext;
  actionResult?: AIMessageActionResult;
}

// AI 会话元数据
export interface AISessionMeta {
  id: string;
  title: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessageContent: string;
  lastMessageTimestamp: number;
}

// AI 会话（包含消息）
export interface AISession extends AISessionMeta {
  messages: AISessionMessage[];
}

// 会话仓库接口
export interface SessionRepository {
  saveSession(session: AISession): Promise<void>;
  loadSession(sessionId: string): Promise<AISession | null>;
  listSessions(projectId?: string): Promise<AISessionMeta[]>;
  deleteSession(sessionId: string): Promise<void>;
  clearOldSessions(maxAgeDays?: number): Promise<void>;
}

// AI 会话仓库接口（扩展版）
export interface AISessionRepository {
  createSession(session: AISession): Promise<void>;
  getSession(sessionId: string): Promise<AISession | null>;
  getSessionsByProject(projectId: string): Promise<AISession[]>;
  addMessage(sessionId: string, message: AISessionMessage): Promise<void>;
  updateSession(session: Partial<AISession> & { id: string }): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

// 工具函数
export function generateMessageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `msg_${crypto.randomUUID()}`;
  }
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `session_${crypto.randomUUID()}`;
  }
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function generateSessionTitle(content: string): string {
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return "新会话";
  }
  return trimmedContent.length > 30
    ? trimmedContent.substring(0, 30) + "..."
    : trimmedContent;
}
