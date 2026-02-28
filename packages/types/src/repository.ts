import type { A2UISchema } from "./schema";

/**
 * 项目元数据
 * 仅包含基础信息，用于列表展示
 */
export interface ProjectMeta {
  /** 项目唯一 ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目描述 */
  description?: string;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 更新时间 (ISO 8601) */
  updatedAt: string;
  /** Schema 版本号 */
  version?: string;
  /** 预览缩略图 (Base64 或 URL) */
  thumbnail?: string;
}

/**
 * 聊天消息定义
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** 该消息生成或对应的 Schema 快照 */
  schemaSnapshot?: A2UISchema;
}

/**
 * 完整项目定义
 * 包含元数据、当前的 Schema 以及 AI 会话历史
 */
export interface Project {
  meta: ProjectMeta;
  schema: A2UISchema;
  chatHistory?: ChatMessage[];
}

/**
 * 项目仓库接口
 * 所有存储实现（IndexedDB, LocalStorage, Remote API）必须遵循此契约
 */
export interface ProjectRepository {
  /** 保存项目 */
  save(project: Project): Promise<void>;

  /** 加载项目 */
  load(id: string): Promise<Project | null>;

  /** 获取所有项目列表 (仅元数据) */
  list(): Promise<ProjectMeta[]>;

  /** 删除项目 */
  delete(id: string): Promise<void>;

  /** 检查项目是否存在 */
  exists(id: string): Promise<boolean>;

  /** 归档/导出项目为 JSON */
  export(id: string): Promise<string>;

  /** 从 JSON 导入项目 */
  import(data: string): Promise<Project>;
}
