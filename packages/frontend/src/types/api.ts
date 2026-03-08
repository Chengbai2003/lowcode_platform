/**
 * 统一 API 响应信封
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error?: string;
  message?: string;
}

/**
 * 分页基础响应
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// —— AI 模块相关类型 ——

/** AI 生成 Schema 的请求 DTO */
export interface GenerateSchemaRequest {
  /** 用户描述 */
  prompt: string;
  /** 可选的补充描述 */
  description?: string;
  /** 当前的 Schema 上下文（用于修改/优化） */
  currentSchema?: import('./schema').A2UISchema;
  /** 模型提供商 (OpenAI / Anthropic / Ollama) */
  provider?: string;
  /** 模型 ID */
  modelId?: string;
}

/** AI 生成 Schema 的响应数据 */
export interface GenerateSchemaResponse {
  /** 生成的 A2UI Schema */
  schema: import('./schema').A2UISchema;
  /** AI 对生成内容的说明 */
  explanation?: string;
  /** 优化建议 */
  suggestions?: string[];
  /** autoFix 纠偏记录（如果有） */
  fixes?: string[];
}

/** AI 模型信息 */
export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  isAvailable: boolean;
  isDefault?: boolean;
}

// —— 项目模块相关类型 ——

/** 保存/更新项目的请求 */
export interface SaveProjectRequest {
  name: string;
  description?: string;
  schema: import('./schema').A2UISchema;
  chatHistory?: import('./repository').ChatMessage[];
}

/** 项目列表项（简略信息） */
export interface ProjectListItem {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  createdAt: string;
  thumbnail?: string;
}
