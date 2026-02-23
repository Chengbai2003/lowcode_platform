/**
 * AI Provider 工厂
 * 负责创建和管理不同的 AI Provider 实例
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAIProvider, ProviderConfig } from './ai-provider.interface';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OllamaProvider } from './ollama-provider';

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | string;

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);
  private readonly providers: Map<string, IAIProvider> = new Map();
  private readonly providerConfigs: Map<string, ProviderConfig> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.initializeProviders();
  }

  /**
   * 初始化所有 Provider
   */
  private initializeProviders(): void {
    this.logger.log('Initializing AI providers...');

    // 默认不注册任何 Provider，完全由用户在前端配置或通过 ai-models.json 管理
    // 如果需要系统级默认 Provider，可以在这里恢复，但目前根据用户需求清除

    // OpenAI
    this.registerProvider('openai', OpenAIProvider, {
      apiKey: this.configService.get<string>('ai.openai.apiKey') || '',
      baseURL: this.configService.get<string>('ai.openai.baseURL') || 'https://api.openai.com/v1',
      model: this.configService.get<string>('ai.openai.model') || 'gpt-4o-mini',
      temperature: this.configService.get<number>('ai.openai.temperature') ?? 0.7,
      maxTokens: this.configService.get<number>('ai.openai.maxTokens') ?? 4096,
    });

    // Anthropic
    this.registerProvider('anthropic', AnthropicProvider, {
      apiKey: this.configService.get<string>('ai.anthropic.apiKey') || '',
      baseURL: this.configService.get<string>('ai.anthropic.baseURL') || 'https://api.anthropic.com',
      model: this.configService.get<string>('ai.anthropic.model') || 'claude-3-sonnet-20240229',
      temperature: this.configService.get<number>('ai.anthropic.temperature') ?? 0.7,
      maxTokens: this.configService.get<number>('ai.anthropic.maxTokens') ?? 4096,
    });

    // Ollama
    this.registerProvider('ollama', OllamaProvider, {
      baseURL: this.configService.get<string>('ai.ollama.baseURL') || 'http://localhost:11434',
      model: this.configService.get<string>('ai.ollama.model') || 'llama3.2',
      temperature: this.configService.get<number>('ai.ollama.temperature') ?? 0.7,
      maxTokens: this.configService.get<number>('ai.ollama.maxTokens') ?? 4096,
    });

    // 注册自定义 Provider
    this.registerCustomProviders();

    this.logger.log(`Initialized ${this.providers.size} providers`);
  }

  /**
   * 注册 Provider
   */
  private registerProvider(
    name: string,
    ProviderClass: new () => IAIProvider,
    config: ProviderConfig,
  ): void {
    try {
      const provider = new ProviderClass();
      provider.initialize(config);

      this.providers.set(name, provider);
      this.providerConfigs.set(name, config);

      this.logger.log(
        `[${name}] Provider registered (${provider.isAvailable ? 'available' : 'unavailable'})`,
      );
    } catch (error) {
      this.logger.error(`[${name}] Failed to register provider:`, error);
    }
  }

  /**
   * 注册自定义 Provider
   */
  private registerCustomProviders(): void {
    const customProviders = this.configService.get<Record<string, ProviderConfig>>('ai.custom', {});

    for (const [name, config] of Object.entries(customProviders)) {
      // 自定义 Provider 默认使用 OpenAI 兼容的接口
      this.registerProvider(name, OpenAIProvider, {
        ...config,
        // 自定义 Provider 的 name 使用配置中的 name
        ...{ name },
      });
    }
  }

  /**
   * 获取 Provider
   */
  getProvider(name: string): IAIProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * 获取默认 Provider
   */
  getDefaultProvider(): IAIProvider {
    const defaultName = this.configService.get<string>('ai.defaultProvider', 'openai');
    const provider = this.providers.get(defaultName);

    if (!provider) {
      throw new Error(`Default provider '${defaultName}' not found`);
    }

    if (!provider.isAvailable) {
      throw new Error(`Default provider '${defaultName}' is not available`);
    }

    return provider;
  }

  /**
   * 获取所有可用的 Provider
   */
  getAvailableProviders(): Array<{ name: string; provider: IAIProvider }> {
    const available: Array<{ name: string; provider: IAIProvider }> = [];

    for (const [name, provider] of this.providers) {
      if (provider.isAvailable) {
        available.push({ name, provider });
      }
    }

    return available;
  }

  /**
   * 获取所有 Provider 的状态
   */
  getAllProviderStatus(): Array<{
    name: string;
    available: boolean;
    config: ProviderConfig | undefined;
  }> {
    const status = [];

    for (const [name, provider] of this.providers) {
      status.push({
        name,
        available: provider.isAvailable,
        config: this.providerConfigs.get(name),
      });
    }

    return status;
  }

  /**
   * 重新加载 Provider 配置
   */
  reloadProviders(): void {
    this.logger.log('Reloading AI providers...');
    this.providers.clear();
    this.providerConfigs.clear();
    this.initializeProviders();
  }
  /**
   * 创建临时的 Provider 实例
   * 用于处理自定义模型配置
   */
  createProviderInstance(type: string, config: ProviderConfig): IAIProvider {
    let ProviderClass: new () => IAIProvider;

    switch (type) {
      case 'openai':
        ProviderClass = OpenAIProvider;
        break;
      case 'anthropic':
        ProviderClass = AnthropicProvider;
        break;
      case 'ollama':
        ProviderClass = OllamaProvider;
        break;
      default:
        // 尝试查找已注册的自定义 Provider 类型
        // 如果找不到，默认使用 OpenAIProvider（因为很多兼容 OpenAI 协议）
        ProviderClass = OpenAIProvider;
    }

    const provider = new ProviderClass();
    provider.initialize(config);
    return provider;
  }
}
