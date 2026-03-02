export interface AISessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

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

export interface AISession extends AISessionMeta {
  messages: AISessionMessage[];
}

export interface SessionRepository {
  saveSession(session: AISession): Promise<void>;
  loadSession(sessionId: string): Promise<AISession | null>;
  listSessions(projectId?: string): Promise<AISessionMeta[]>;
  deleteSession(sessionId: string): Promise<void>;
  clearOldSessions(maxAgeDays?: number): Promise<void>;
}
