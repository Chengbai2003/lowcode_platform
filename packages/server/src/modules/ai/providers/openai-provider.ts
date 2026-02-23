/**
 * OpenAI Provider 实现
 * 支持 OpenAI 官方 API 及兼容服务（如 Azure、SiliconFlow、DeepSeek 等）
 */

import { Observable, Subscriber } from 'rxjs';
import { BaseProvider } from './base-provider';
import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
} from './ai-provider.interface';

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';

  private get apiKey(): string {
    return this.config?.apiKey || '';
  }

  private get baseURL(): string {
    return this.config?.baseURL || 'https://api.openai.com/v1';
  }

  private get model(): string {
    return this.config?.model || 'gpt-4o-mini';
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

    const url = `${this.baseURL}/chat/completions`;
    const body = this.buildRequestBody(request, false);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
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
      const url = `${this.baseURL}/chat/completions`;
      const body = this.buildRequestBody(request, true);

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
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
              if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                if (trimmedLine === 'data: [DONE]') {
                  subscriber.complete();
                  return;
                }
                continue;
              }

              if (trimmedLine.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmedLine.slice(6));
                  const chunk = this.parseStreamChunk(data, isFirstChunk);
                  isFirstChunk = false;
                  subscriber.next(chunk);
                } catch (e) {
                  console.warn('Failed to parse stream chunk:', e);
                }
              }
            }
          }
        })
        .catch((error) => {
          subscriber.error(error);
        });

      return () => {
        // 清理逻辑（如果需要）
      };
    });
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(request: ChatRequest, stream: boolean): any {
    return {
      model: request.model || this.model,
      messages: this.normalizeMessages(request.messages),
      temperature: request.temperature ?? this.config?.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? this.config?.maxTokens ?? 4096,
      top_p: request.topP ?? 1,
      frequency_penalty: request.frequencyPenalty ?? 0,
      presence_penalty: request.presencePenalty ?? 0,
      stream,
      stop: request.stop,
    };
  }

  /**
   * 解析响应
   */
  private parseResponse(data: any): ChatResponse {
    const choice = data.choices[0];
    return {
      id: data.id,
      object: data.object,
      created: data.created,
      model: data.model,
      choices: [
        {
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content,
          },
          finish_reason: choice.finish_reason,
        },
      ],
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: any, isFirst: boolean): StreamChunk {
    const choice = data.choices[0];
    const delta = choice.delta;

    return {
      id: data.id,
      object: 'chat.completion.chunk',
      created: data.created,
      model: data.model,
      choices: [
        {
          index: choice.index,
          delta: {
            ...(isFirst && delta.role ? { role: delta.role } : {}),
            ...(delta.content ? { content: delta.content } : {}),
          },
          finish_reason: choice.finish_reason,
        },
      ],
    };
  }
}
