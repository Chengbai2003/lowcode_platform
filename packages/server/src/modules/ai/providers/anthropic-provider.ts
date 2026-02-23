/**
 * Anthropic (Claude) Provider 实现
 */

import { Observable, Subscriber } from 'rxjs';
import { BaseProvider } from './base-provider';
import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ChatMessage,
} from './ai-provider.interface';

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';

  private get apiKey(): string {
    return this.config?.apiKey || '';
  }

  private get baseURL(): string {
    return this.config?.baseURL || 'https://api.anthropic.com';
  }

  private get model(): string {
    return this.config?.model || 'claude-3-sonnet-20240229';
  }

  initialize(config: ProviderConfig): void {
    super.initialize(config);
  }

  protected validateConfig(): boolean {
    if (!super.validateConfig()) return false;
    if (!this.config?.apiKey) {
      console.warn(`[${this.name}] API key is required`);
      return false;
    }
    return true;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isAvailable) {
      throw new Error(`Provider ${this.name} is not available`);
    }

    const url = `${this.baseURL}/v1/messages`;
    const { systemMessage, messages } = this.convertMessages(request.messages);
    const body: any = {
      model: request.model || this.model,
      messages,
      max_tokens: request.maxTokens || this.config?.maxTokens || 4096,
      temperature: request.temperature ?? this.config?.temperature ?? 0.7,
      top_p: request.topP ?? 1,
      stream: false,
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      console.error(`[${this.name}] Chat request failed:`, error);
      throw error;
    }
  }

  chatStream(request: ChatRequest): Observable<StreamChunk> {
    if (!this.isAvailable) {
      throw new Error(`Provider ${this.name} is not available`);
    }

    return new Observable((subscriber: Subscriber<StreamChunk>) => {
      const url = `${this.baseURL}/v1/messages`;
      const { systemMessage, messages } = this.convertMessages(request.messages);
      const body: any = {
        model: request.model || this.model,
        messages,
        max_tokens: request.maxTokens || this.config?.maxTokens || 4096,
        temperature: request.temperature ?? this.config?.temperature ?? 0.7,
        stream: true,
      };

      if (systemMessage) {
        body.system = systemMessage;
      }

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${error}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let isFirstChunk = true;

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              subscriber.complete();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || !trimmedLine.startsWith('data: ')) {
                continue;
              }

              const data = trimmedLine.slice(6);
              if (data === '[DONE]') {
                subscriber.complete();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const chunk = this.parseStreamChunk(parsed, isFirstChunk);
                isFirstChunk = false;
                subscriber.next(chunk);
              } catch (e) {
                console.warn('Failed to parse stream chunk:', e);
              }
            }
          }
        })
        .catch((error) => {
          subscriber.error(error);
        });

      return () => {
        // 清理逻辑
      };
    });
  }

  /**
   * 转换消息格式（OpenAI -> Anthropic）
   * Anthropic 使用 system 参数而不是 system 角色消息
   */
  private convertMessages(
    messages: { role: string; content: string }[],
  ): { systemMessage: string | null; messages: { role: 'user' | 'assistant'; content: string }[] } {
    let systemMessage: string | null = null;
    const filteredMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // 合并多个 system 消息
        systemMessage = systemMessage ? `${systemMessage}\n\n${msg.content}` : msg.content;
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        filteredMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return { systemMessage, messages: filteredMessages };
  }

  /**
   * 解析响应
   */
  private parseResponse(data: any): ChatResponse {
    const content = data.content?.[0]?.text || '';
    const usage = data.usage || {};

    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: data.stop_reason || 'stop',
        },
      ],
      usage: {
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      },
    };
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: any, isFirst: boolean): StreamChunk {
    const delta = data.delta || {};
    const content = delta.text || '';

    return {
      id: data.id || this.generateId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: data.model || this.model,
      choices: [
        {
          index: 0,
          delta: {
            ...(isFirst ? { role: 'assistant' } : {}),
            ...(content ? { content } : {}),
          },
          finish_reason: data.stop_reason || null,
        },
      ],
    };
  }
}
