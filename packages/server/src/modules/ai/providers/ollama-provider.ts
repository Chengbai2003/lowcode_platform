/**
 * Ollama Provider 实现
 * 支持本地运行的 Ollama 模型服务
 */

import { Observable, Subscriber } from 'rxjs';
import { BaseProvider } from './base-provider';
import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
} from './ai-provider.interface';

export class OllamaProvider extends BaseProvider {
  readonly name = 'ollama';

  private get baseURL(): string {
    return this.config?.baseURL || 'http://localhost:11434';
  }

  private get model(): string {
    return this.config?.model || 'llama3.2';
  }

  initialize(config: ProviderConfig): void {
    super.initialize(config);
  }

  protected validateConfig(): boolean {
    if (!this.config) return false;
    if (!this.config.baseURL) {
      console.warn(`[${this.name}] Base URL is required, using default: http://localhost:11434`);
      this.config.baseURL = 'http://localhost:11434';
    }
    return true;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isAvailable) {
      throw new Error(`Provider ${this.name} is not available`);
    }

    const url = `${this.baseURL}/api/chat`;
    const body = this.buildRequestBody(request, false);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return this.parseResponse(data, request.model || this.model);
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
      const url = `${this.baseURL}/api/chat`;
      const body = this.buildRequestBody(request, true);

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ollama API error: ${response.status} - ${error}`);
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
              if (!trimmedLine) continue;

              try {
                const data = JSON.parse(trimmedLine);
                const chunk = this.parseStreamChunk(data, isFirstChunk);
                isFirstChunk = false;
                subscriber.next(chunk);

                if (data.done) {
                  subscriber.complete();
                  return;
                }
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
   * 构建请求体
   */
  private buildRequestBody(request: ChatRequest, stream: boolean): any {
    // 提取系统消息
    let systemMessage = '';
    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemMessage = systemMessage
          ? `${systemMessage}\n\n${msg.content}`
          : msg.content;
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const body: any = {
      model: request.model || this.model,
      messages,
      stream,
      options: {
        temperature: request.temperature ?? this.config?.temperature ?? 0.7,
        num_predict: request.maxTokens ?? this.config?.maxTokens ?? 4096,
        top_p: request.topP ?? 1,
        frequency_penalty: request.frequencyPenalty ?? 0,
        presence_penalty: request.presencePenalty ?? 0,
        stop: request.stop,
      },
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    return body;
  }

  /**
   * 解析响应
   */
  private parseResponse(data: any, model: string): ChatResponse {
    const content = data.message?.content || '';

    return {
      id: data.id || this.generateId(),
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
          finish_reason: data.done_reason || 'stop',
        },
      ],
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens:
          (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: any, isFirst: boolean): StreamChunk {
    const content = data.message?.content || '';

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
          finish_reason: data.done ? 'stop' : null,
        },
      ],
    };
  }
}
