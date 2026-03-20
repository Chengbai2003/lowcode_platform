/**
 * AI 服务 (Vercel AI SDK)
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, jsonSchema, stepCountIs, streamText, tool } from 'ai';
import { ToolDefinition } from '../agent-tools/types/tool.types';
import { ChatRequestDto, GenerateSchemaDto } from './dto/chat-request.dto';
import { AIProviderFactory } from './providers/ai-provider.factory';

export class AIToolCallingError extends Error {
  constructor(
    public readonly reason: 'timeout' | 'policy',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AIToolCallingError';
  }
}

export interface AIToolCallingResult {
  text: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  warnings: unknown[] | undefined;
  steps: Array<{
    stepNumber: number;
    finishReason: string;
    toolCalls: Array<{ toolName: string }>;
  }>;
  toolCallCount: number;
}

function isAbortLikeError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
  );
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly codeGenSystemPrompt: string;

  constructor(
    private readonly providerFactory: AIProviderFactory,
    private readonly configService: ConfigService,
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

  async runToolCalling(input: {
    system: string;
    prompt: string;
    provider?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs: number;
    maxSteps: number;
    maxToolCalls: number;
    toolDefinitions: ToolDefinition[];
    executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
    onStepFinish?: (event: {
      stepNumber: number;
      finishReason: string;
      toolCalls: Array<{ toolName: string }>;
    }) => void;
    onToolCallStart?: (event: { stepNumber?: number; toolCall: { toolName: string } }) => void;
    onToolCallFinish?: (event: {
      stepNumber?: number;
      toolCall: { toolName: string };
      success: boolean;
    }) => void;
  }): Promise<AIToolCallingResult> {
    const { model } = this.providerFactory.resolveModel(input.modelId, input.provider);
    let toolCallCount = 0;

    this.logger.log(`[tool-calling] Using model: ${input.modelId || input.provider || 'default'}`);

    const tools = Object.fromEntries(
      input.toolDefinitions.map((definition) => [
        definition.name,
        tool({
          description: definition.description,
          inputSchema: jsonSchema(definition.inputSchema),
          execute: async (toolInput) =>
            input.executeTool(definition.name, toolInput as Record<string, unknown>),
        }),
      ]),
    );

    try {
      const result = await generateText({
        model: model as any,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        tools,
        activeTools: input.toolDefinitions.map((definition) => definition.name),
        stopWhen: stepCountIs(input.maxSteps),
        timeout: input.timeoutMs,
        experimental_onToolCallStart: (event) => {
          toolCallCount += 1;
          if (toolCallCount > input.maxToolCalls) {
            throw new AIToolCallingError('policy', 'Tool call limit exceeded', {
              toolCallCount,
              maxToolCalls: input.maxToolCalls,
            });
          }

          input.onToolCallStart?.({
            stepNumber: event.stepNumber,
            toolCall: {
              toolName: event.toolCall.toolName,
            },
          });
        },
        experimental_onToolCallFinish: (event) => {
          input.onToolCallFinish?.({
            stepNumber: event.stepNumber,
            toolCall: {
              toolName: event.toolCall.toolName,
            },
            success: event.success,
          });
        },
        onStepFinish: (event) => {
          input.onStepFinish?.({
            stepNumber: event.stepNumber,
            finishReason: event.finishReason,
            toolCalls: event.toolCalls.map((toolCall) => ({
              toolName: toolCall.toolName,
            })),
          });
        },
      });

      return {
        text: result.text,
        finishReason: result.finishReason,
        usage: {
          promptTokens: (result.usage as any)?.promptTokens || 0,
          completionTokens: (result.usage as any)?.completionTokens || 0,
          totalTokens: (result.usage as any)?.totalTokens || 0,
        },
        totalUsage: {
          promptTokens: (result.totalUsage as any)?.promptTokens || 0,
          completionTokens: (result.totalUsage as any)?.completionTokens || 0,
          totalTokens: (result.totalUsage as any)?.totalTokens || 0,
        },
        warnings: result.warnings,
        steps: result.steps.map((step) => ({
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          toolCalls: step.toolCalls.map((toolCall) => ({
            toolName: toolCall.toolName,
          })),
        })),
        toolCallCount,
      };
    } catch (error) {
      if (error instanceof AIToolCallingError) {
        throw error;
      }

      if (isAbortLikeError(error)) {
        throw new AIToolCallingError('timeout', 'Tool calling request timed out', {
          timeoutMs: input.timeoutMs,
          toolCallCount,
        });
      }

      throw new AIToolCallingError(
        'policy',
        error instanceof Error ? error.message : 'Tool calling request failed',
        {
          toolCallCount,
          causeName: error instanceof Error ? error.name : 'UnknownError',
        },
      );
    }
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
      .filter((provider) => provider.available)
      .map((provider) => provider.name);
  }

  /**
   * 获取某一个 Provider Health
   */
  async getProviderHealth(providerName?: string) {
    const providers = this.providerFactory.getAllProviderStatus();
    if (providerName) {
      return providers
        .filter((provider) => provider.name === providerName)
        .map((provider) => ({
          name: provider.name,
          healthy: provider.available,
        }));
    }

    return providers.map((provider) => ({
      name: provider.name,
      healthy: provider.available,
    }));
  }
}
