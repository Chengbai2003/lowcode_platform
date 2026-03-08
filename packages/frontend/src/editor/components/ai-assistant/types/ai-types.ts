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

// AI响应接口
export interface AIResponse {
  content: string;
  schema?: A2UISchema;
  suggestions?: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// AI请求接口
export interface AIRequest {
  prompt: string;
  modelId?: string; // 指定使用的模型 ID
  context?: {
    currentSchema?: A2UISchema;
    conversationHistory?: Array<{ role: string; content: string }>;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

// AI服务接口
export interface AIService {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  streamResponse?(
    request: AIRequest,
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
