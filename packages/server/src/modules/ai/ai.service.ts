/**
 * AI 服务
 * 处理 AI 相关的业务逻辑
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, map, catchError, throwError } from 'rxjs';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { ModelConfigService } from './model-config.service';
import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ChatMessage,
  IAIProvider,
} from './providers/ai-provider.interface';
import {
  ChatRequestDto,
  GenerateSchemaDto,
} from './dto/chat-request.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly codeGenSystemPrompt: string;

  constructor(
    private readonly providerFactory: AIProviderFactory,
    private readonly configService: ConfigService,
    private readonly modelConfigService: ModelConfigService,
  ) {
    this.codeGenSystemPrompt =
      this.configService.get<string>('ai.codegen.systemPrompt') ||
      `You are a code generator for a low-code platform.
Your task is to generate JSON schema for UI components based on user requirements.
The schema follows the A2UI format with the following structure:
- rootId: the root component ID
- components: a flat map of components with their properties and childrenIds

Supported component types include: Page, Container, Button, Input, Form, Table, Card, etc.

Respond ONLY with valid JSON. Do not include markdown formatting or explanations.`;
  }

  /**
   * 发送聊天请求
   */
  async chat(dto: ChatRequestDto): Promise<ChatResponse> {
    const provider = this.getProvider(dto.provider, dto.modelId);
    const request = this.buildChatRequest(dto);

    this.logger.log(`[${provider.name}] Sending chat request`);

    return provider.chat(request);
  }

  /**
   * 发送流式聊天请求
   */
  chatStream(dto: ChatRequestDto): Observable<StreamChunk> {
    const provider = this.getProvider(dto.provider, dto.modelId);
    const request = this.buildChatRequest(dto);

    this.logger.log(`[${provider.name}] Starting chat stream`);

    return provider.chatStream(request).pipe(
      map((chunk) => chunk),
      catchError((error) => {
        this.logger.error(`[${provider.name}] Stream error:`, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 生成组件 Schema
   */
  async generateSchema(dto: GenerateSchemaDto): Promise<ChatResponse> {
    const provider = this.getProvider(dto.provider);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.codeGenSystemPrompt,
      },
    ];

    if (dto.description) {
      messages.push({
        role: 'user',
        content: `Generate a UI schema for: ${dto.description}`,
      });
    } else if (dto.prompt) {
      messages.push({
        role: 'user',
        content: dto.prompt,
      });
    } else {
      throw new BadRequestException('Either description or prompt is required');
    }

    const request: ChatRequest = {
      messages,
      model: dto.model,
      temperature: dto.temperature ?? 0.2, // 代码生成使用较低温度
      maxTokens: this.configService.get<number>('ai.codegen.maxTokens', 8192),
    };

    this.logger.log(`[${provider.name}] Generating schema`);

    return provider.chat(request);
  }

  /**
   * 流式生成组件 Schema
   */
  generateSchemaStream(dto: GenerateSchemaDto): Observable<StreamChunk> {
    const provider = this.getProvider(dto.provider);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.codeGenSystemPrompt,
      },
    ];

    if (dto.description) {
      messages.push({
        role: 'user',
        content: `Generate a UI schema for: ${dto.description}`,
      });
    } else if (dto.prompt) {
      messages.push({
        role: 'user',
        content: dto.prompt,
      });
    } else {
      throw new BadRequestException('Either description or prompt is required');
    }

    const request: ChatRequest = {
      messages,
      model: dto.model,
      temperature: dto.temperature ?? 0.2,
      maxTokens: this.configService.get<number>('ai.codegen.maxTokens', 8192),
    };

    this.logger.log(`[${provider.name}] Starting schema stream`);

    return provider.chatStream(request);
  }

  /**
   * 获取 Provider 健康状态
   */
  async getProviderHealth(providerName?: string): Promise<
    Array<{
      name: string;
      healthy: boolean;
      latency?: number;
      error?: string;
    }>
  > {
    const providers = providerName
      ? [this.providerFactory.getProvider(providerName)].filter((p): p is IAIProvider => !!p)
      : this.providerFactory.getAvailableProviders().map((p) => p.provider);

    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          const health = await provider.healthCheck();
          return {
            name: provider.name,
            healthy: health.healthy,
            latency: health.latency,
            error: health.error,
          };
        } catch (error) {
          return {
            name: provider.name,
            healthy: false,
            error: (error as any).message,
          };
        }
      }),
    );

    return results;
  }

  /**
   * 获取所有 Provider 状态
   */
  getAllProviderStatus(): Array<{
    name: string;
    available: boolean;
    config?: any;
  }> {
    return this.providerFactory.getAllProviderStatus().map((status) => ({
      name: status.name,
      available: status.available,
      config: status.config,
    }));
  }

  /**
   * 获取可用的 Provider 列表
   */
  getAvailableProviders(): string[] {
    return this.providerFactory
      .getAvailableProviders()
      .map((p) => p.name);
  }

  /**
   * 获取 Provider
   */
  private getProvider(providerName?: string, modelId?: string) {
    // 1. 如果有 modelId，优先使用自定义模型配置
    if (modelId) {
      const modelConfig = this.modelConfigService.getModel(modelId);

      if (modelConfig) {
        // ... custom model logic ...
        const providerType = modelConfig.provider;

        // 尝试获取基础 Provider
        const baseProvider = this.providerFactory.getProvider(providerType);
        if (!baseProvider) {
          throw new BadRequestException(`Provider type '${providerType}' not found for model '${modelId}'`);
        }

        // 使用 Factory 动态创建实例 (或者复用逻辑)
        return this.providerFactory.createProviderInstance(providerType, modelConfig);
      }

      // 如果没有找到自定义配置，尝试检查是否是默认 Provider ID (例如 'openai')
      // 前端会将默认 Provider 的 name 作为 ID 传过来
      const defaultProvider = this.providerFactory.getProvider(modelId);
      if (defaultProvider) {
        if (!defaultProvider.isAvailable) {
          throw new BadRequestException(`Provider '${modelId}' is not available`);
        }
        return defaultProvider;
      }

      throw new BadRequestException(`Model config '${modelId}' not found`);
    }

    const name = providerName || this.configService.get<string>('ai.defaultProvider', 'openai');
    const provider = this.providerFactory.getProvider(name);

    if (!provider) {
      throw new BadRequestException(`Provider '${name}' not found`);
    }

    if (!provider.isAvailable) {
      throw new BadRequestException(`Provider '${name}' is not available`);
    }

    return provider;
  }

  /**
   * 构建聊天请求
   */
  private buildChatRequest(dto: ChatRequestDto): ChatRequest {
    return {
      messages: dto.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      model: dto.model,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      topP: dto.topP,
      frequencyPenalty: dto.frequencyPenalty,
      presencePenalty: dto.presencePenalty,
      stream: dto.stream,
      stop: dto.stop,
    };
  }
}
