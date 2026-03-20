import type { A2UISchema } from '../../../../types';
import type { EditorPatchOperation } from '../../../types/patch';

// AI模型配置接口
export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'ollama' | 'mock';
  apiKey?: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  isAvailable?: boolean;
}

export interface AgentConversationMessage {
  role: string;
  content: string;
}

export type AgentResponseMode = 'schema' | 'patch';

export interface AgentEditSchemaResponse {
  mode: 'schema';
  content: string;
  schema?: A2UISchema;
  warnings?: string[];
  suggestions?: string[];
  traceId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AgentEditPatchResponse {
  mode: 'patch';
  pageId?: string;
  baseVersion?: number;
  resolvedVersion?: number;
  resolvedSelectedId?: string;
  patch: EditorPatchOperation[];
  warnings?: string[];
  traceId: string;
}

// Agent 编辑响应接口（Phase 4 双模兼容）
export type AgentEditResponse = AgentEditSchemaResponse | AgentEditPatchResponse;

// Agent 编辑请求接口
export interface AgentEditRequest {
  instruction: string;
  modelId?: string; // 指定使用的模型 ID
  provider?: string;
  pageId?: string;
  version?: number;
  selectedId?: string;
  draftSchema?: A2UISchema;
  conversationHistory?: AgentConversationMessage[];
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
  stream?: boolean;
  responseMode?: AgentResponseMode;
}

export type AIRequest = AgentEditRequest;
export type AIResponse = AgentEditResponse;

// AI服务接口
export interface AIService {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  generateResponse(request: AgentEditRequest): Promise<AgentEditResponse>;
  streamResponse?(
    request: AgentEditRequest,
    onMessage: (chunk: string) => void,
    onError?: (error: any) => void,
  ): Promise<void>;
}

// 错误类型
export class AIServiceError extends Error {
  constructor(
    message: string,
    public code:
      | 'API_KEY_MISSING'
      | 'MODEL_NOT_AVAILABLE'
      | 'RATE_LIMIT'
      | 'NETWORK_ERROR'
      | 'INVALID_RESPONSE',
    public details?: any,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}
