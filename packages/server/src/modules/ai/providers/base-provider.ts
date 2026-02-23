/**
 * AI Provider 基类
 * 提供通用功能和工具方法
 */

import { Observable, Subscriber } from 'rxjs';
import {
  IAIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ChatMessage,
} from './ai-provider.interface';

export abstract class BaseProvider implements IAIProvider {
  abstract readonly name: string;
  protected config: ProviderConfig | null = null;
  protected _isAvailable = false;

  get isAvailable(): boolean {
    return this._isAvailable && this.config !== null;
  }

  initialize(config: ProviderConfig): void {
    this.config = { ...config };
    this._isAvailable = this.validateConfig();

    if (!this._isAvailable) {
      console.warn(`[${this.name}] Provider initialization failed: invalid configuration`);
    } else {
      console.log(`[${this.name}] Provider initialized successfully`);
    }
  }

  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract chatStream(request: ChatRequest): Observable<StreamChunk>;

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      if (!this.isAvailable) {
        throw new Error('Provider not available');
      }

      // 发送一个简单的测试请求
      await this.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 10,
      });

      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 验证配置
   */
  protected validateConfig(): boolean {
    if (!this.config) return false;
    if (!this.config.baseURL) return false;
    return true;
  }

  /**
   * 构建标准响应
   */
  protected buildResponse(
    content: string,
    model: string,
    usage?: { promptTokens: number; completionTokens: number },
  ): ChatResponse {
    return {
      id: this.generateId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        promptTokens: usage?.promptTokens || 0,
        completionTokens: usage?.completionTokens || 0,
        totalTokens: (usage?.promptTokens || 0) + (usage?.completionTokens || 0),
      },
    };
  }

  /**
   * 构建流式响应块
   */
  protected buildStreamChunk(
    content: string,
    model: string,
    isFirst: boolean = false,
    isLast: boolean = false,
  ): StreamChunk {
    return {
      id: this.generateId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            ...(isFirst ? { role: 'assistant' } : {}),
            ...(content ? { content } : {}),
          },
          finish_reason: isLast ? 'stop' : null,
        },
      ],
    };
  }

  /**
   * 计算token数量（简单估算）
   */
  protected estimateTokens(text: string): number {
    // 简单估算：平均1个token约4个字符（英文）
    // 中文约为1:1.5
    return Math.ceil(text.length / 4);
  }

  /**
   * 生成唯一ID
   */
  protected generateId(): string {
    return `chatcmpl-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 标准化消息格式
   */
  protected normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));
  }
}
