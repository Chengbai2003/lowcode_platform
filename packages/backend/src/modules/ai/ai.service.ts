/**
 * AI 服务 (Vercel AI SDK)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText, generateText, generateObject } from 'ai';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { ChatRequestDto, GenerateSchemaDto } from './dto/chat-request.dto';
import { ModelConfigService } from './model-config.service';

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

  async chat(dto: ChatRequestDto) {
    const { model } = this.providerFactory.resolveModel(dto.modelId, dto.provider);

    this.logger.log(`[chat] Using model: ${dto.modelId || dto.provider || 'default'}`);

    const result = await generateText({
      model: model as any,
      messages: dto.messages as any,
      temperature: dto.temperature,
      // @ts-ignore
      maxTokens: dto.maxTokens,
      topP: dto.topP,
      frequencyPenalty: dto.frequencyPenalty,
      presencePenalty: dto.presencePenalty,
    });

    return {
      content: result.text,
      usage: {
        promptTokens: (result.usage as any)?.promptTokens || 0,
        completionTokens: (result.usage as any)?.completionTokens || 0,
        totalTokens: (result.usage as any)?.totalTokens || 0,
      },
      finishReason: result.finishReason,
    };
  }

  /**
   * 发送流式聊天请求 — 返回 StreamTextResult 供 Controller 使用
   */
  chatStream(dto: ChatRequestDto): any {
    const { model } = this.providerFactory.resolveModel(dto.modelId, dto.provider);

    this.logger.log(`[chatStream] Using model: ${dto.modelId || dto.provider || 'default'}`);

    return streamText({
      model: model as any,
      messages: dto.messages as any,
      temperature: dto.temperature,
      // @ts-ignore
      maxTokens: dto.maxTokens,
      topP: dto.topP,
      frequencyPenalty: dto.frequencyPenalty,
      presencePenalty: dto.presencePenalty,
    });
  }

  /**
   * 生成组件 Schema（非流式）
   */
  async generateSchema(dto: GenerateSchemaDto) {
    const { model } = this.providerFactory.resolveModel(undefined, dto.provider);

    const messages: any[] = [{ role: 'system', content: this.codeGenSystemPrompt }];

    if (dto.description) {
      messages.push({
        role: 'user',
        content: `Generate a UI schema for: ${dto.description}`,
      });
    } else if (dto.prompt) {
      messages.push({ role: 'user', content: dto.prompt });
    } else {
      throw new BadRequestException('Either description or prompt is required');
    }

    const result = await generateText({
      model: model as any,
      messages: messages as any,
      temperature: dto.temperature ?? 0.2,
      // @ts-ignore
      maxTokens: this.configService.get<number>('ai.codegen.maxTokens', 8192),
    });

    return {
      content: result.text,
      usage: {
        promptTokens: (result.usage as any)?.promptTokens || 0,
        completionTokens: (result.usage as any)?.completionTokens || 0,
        totalTokens: (result.usage as any)?.totalTokens || 0,
      },
    };
  }

  /**
   * 流式生成 Schema — 返回 StreamTextResult
   */
  generateSchemaStream(dto: GenerateSchemaDto): any {
    const { model } = this.providerFactory.resolveModel(undefined, dto.provider);

    const messages: any[] = [{ role: 'system', content: this.codeGenSystemPrompt }];

    if (dto.description) {
      messages.push({
        role: 'user',
        content: `Generate a UI schema for: ${dto.description}`,
      });
    } else if (dto.prompt) {
      messages.push({ role: 'user', content: dto.prompt });
    } else {
      throw new BadRequestException('Either description or prompt is required');
    }

    return streamText({
      model: model as any,
      messages: messages as any,
      temperature: dto.temperature ?? 0.2,
      // @ts-ignore
      maxTokens: this.configService.get<number>('ai.codegen.maxTokens', 8192),
    });
  }

  /**
   * 获取 Provider 状态
   */
  getAllProviderStatus() {
    return this.providerFactory.getAllProviderStatus();
  }

  getAvailableProviders(): string[] {
    return this.providerFactory
      .getAllProviderStatus()
      .filter((p) => p.available)
      .map((p) => p.name);
  }

  /**
   * 获取某一个 Provider Health
   */
  async getProviderHealth(providerName?: string) {
    // 为了简单起见，使用 getAllProviderStatus 作为近似健康状态
    const providers = this.providerFactory.getAllProviderStatus();
    if (providerName) {
      return providers
        .filter((p) => p.name === providerName)
        .map((p) => ({
          name: p.name,
          healthy: p.available,
        }));
    }
    return providers.map((p) => ({
      name: p.name,
      healthy: p.available,
    }));
  }
}
