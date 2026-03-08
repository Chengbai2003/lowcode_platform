/**
 * AI Provider 工厂 (Vercel AI SDK)
 * 根据配置动态创建 AI SDK LanguageModel 实例
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ollama } from 'ollama-ai-provider';
import { ProviderConfig, ProviderType } from './ai-provider.interface';
import { ModelConfigService, AIModelConfigEntity } from '../model-config.service';

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  /**
   * 根据 providerType + config 创建 LanguageModel 实例
   */
  createLanguageModel(type: ProviderType, config: ProviderConfig): LanguageModel {
    switch (type) {
      case 'anthropic': {
        const anthropic = createAnthropic({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
        });
        return anthropic(config.model);
      }
      case 'ollama': {
        return ollama(config.model, {
          // ollama-ai-provider 使用 simulateStreaming
        }) as any;
      }
      case 'openai':
      default: {
        // OpenAI 兼容（也支持 DeepSeek、GLM、SiliconFlow 等）
        const openai = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
        });
        // 使用 .chat() 强制走 Chat Completions API（/v1/chat/completions）
        // 而非 ai-sdk v3+ 默认的 Responses API（/v3/responses）
        // 第三方 OpenAI 兼容服务（火山引擎、DeepSeek 等）通常只支持前者
        return openai.chat(config.model);
      }
    }
  }

  /**
   * 根据 modelId 解析出 LanguageModel
   * 优先查 ModelConfigService（用户自定义），再查环境变量默认配置
   */
  resolveModel(
    modelId?: string,
    providerName?: string,
  ): {
    model: LanguageModel;
    config: ProviderConfig;
  } {
    // 1. 如果有 modelId，先查自定义模型配置
    if (modelId) {
      const customModel = this.modelConfigService.getModel(modelId);
      if (customModel) {
        return {
          model: this.createLanguageModel(customModel.provider, customModel),
          config: customModel,
        };
      }

      // modelId 也可能是默认 Provider 名（如 'openai'）
      const envConfig = this.getEnvProviderConfig(modelId);
      if (envConfig) {
        return {
          model: this.createLanguageModel(modelId, envConfig),
          config: envConfig,
        };
      }

      throw new Error(`Model config '${modelId}' not found`);
    }

    // 2. 使用 providerName 或默认 Provider
    const name = providerName || this.configService.get<string>('ai.defaultProvider', 'openai');
    const envConfig = this.getEnvProviderConfig(name);
    if (!envConfig) {
      throw new Error(`Provider '${name}' not configured`);
    }

    return {
      model: this.createLanguageModel(name, envConfig),
      config: envConfig,
    };
  }

  /**
   * 获取环境变量中的 Provider 配置
   */
  private getEnvProviderConfig(name: string): ProviderConfig | null {
    const key = `ai.${name}`;
    const config = this.configService.get(key);
    if (!config || !config.model) return null;

    return {
      apiKey: config.apiKey || '',
      baseURL: config.baseURL || '',
      model: config.model,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
    };
  }

  /**
   * 获取所有可用的 Provider 状态（用于 /providers/status 接口）
   */
  getAllProviderStatus(): Array<{
    name: string;
    available: boolean;
    config: ProviderConfig | undefined;
  }> {
    const providers = ['openai', 'anthropic', 'ollama'];
    return providers.map((name) => {
      const config = this.getEnvProviderConfig(name);
      return {
        name,
        available: !!config?.apiKey || name === 'ollama', // ollama 不需要 apiKey
        config: config || undefined,
      };
    });
  }
}
