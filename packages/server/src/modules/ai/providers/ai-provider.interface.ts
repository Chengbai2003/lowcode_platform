/**
 * AI Provider 接口定义
 * 所有AI服务提供商必须实现此接口
 */

import { Observable } from 'rxjs';

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 聊天请求参数
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  stop?: string | string[];
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * 完整响应
 */
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Provider配置
 */
export interface ProviderConfig {
  apiKey?: string;
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  [key: string]: any;
}

/**
 * AI Provider 接口
 */
export interface IAIProvider {
  /**
   * Provider名称
   */
  readonly name: string;

  /**
   * 是否可用
   */
  readonly isAvailable: boolean;

  /**
   * 初始化Provider
   */
  initialize(config: ProviderConfig): void;

  /**
   * 发送聊天请求（非流式）
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 发送聊天请求（流式）
   * 返回Observable用于SSE推送
   */
  chatStream(request: ChatRequest): Observable<StreamChunk>;

  /**
   * 检查Provider健康状态
   */
  healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }>;

  /**
   * 获取模型列表（如果支持）
   */
  listModels?(): Promise<string[]>;
}
