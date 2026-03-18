import type { A2UISchema } from '../../../../types';

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

// Agent 编辑响应接口（当前仍返回整页 schema）
export interface AgentEditResponse {
  mode: 'schema';
  content: string;
  schema?: A2UISchema;
  warnings?: string[];
  suggestions?: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

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
