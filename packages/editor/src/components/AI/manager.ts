import type { AIModelConfig, AIService } from './types';
import { OpenAIService, AnthropicService } from './services';
import { MockAIService } from './mockService';

// AI模型管理器
export class AIModelManager {
  private services: Map<string, AIService> = new Map();
  private configs: Map<string, AIModelConfig> = new Map();
  private fallbackService: AIService;

  constructor() {
    // 初始化兜底服务
    this.fallbackService = new MockAIService();
    this.services.set('mock', this.fallbackService);
    
    // 初始化默认配置
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs() {
    // 预定义的模型配置
    const defaultConfigs: AIModelConfig[] = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4',
        isDefault: true,
        isAvailable: false, // 需要API key
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        isAvailable: false,
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        isAvailable: false,
      },
      {
        id: 'mock',
        name: 'Mock AI (本地兜底)',
        provider: 'local',
        model: 'mock',
        isDefault: true,
        isAvailable: true,
      }
    ];

    defaultConfigs.forEach(config => {
      this.configs.set(config.id, config);
    });
  }

  // 注册AI服务
  registerService(modelId: string, config: AIModelConfig): AIService {
    let service: AIService;

    switch (config.provider) {
      case 'openai':
        service = new OpenAIService(config);
        break;
      case 'anthropic':
        service = new AnthropicService(config);
        break;
      default:
        service = this.fallbackService;
    }

    this.services.set(modelId, service);
    this.configs.set(modelId, { ...config, isAvailable: service.isAvailable() });
    
    return service;
  }

  // 获取当前激活的服务
  getActiveService(modelId?: string): AIService {
    const config = this.getPreferredModel(modelId);
    
    if (!config) {
      console.warn('No AI model available, using fallback service');
      return this.fallbackService;
    }

    let service = this.services.get(config.id);
    
    if (!service) {
      try {
        service = this.registerService(config.id, config);
      } catch (error) {
        console.error(`Failed to initialize ${config.name}:`, error);
        return this.fallbackService;
      }
    }

    // 如果服务不可用，回退到兜底服务
    if (!service.isAvailable()) {
      console.warn(`${config.name} is not available, using fallback service`);
      return this.fallbackService;
    }

    return service;
  }

  // 获取首选模型
  private getPreferredModel(modelId?: string): AIModelConfig | null {
    if (modelId) {
      const config = this.configs.get(modelId);
      if (config) return config;
    }

    // 查找默认模型
    for (const config of this.configs.values()) {
      if (config.isAvailable && config.isDefault) {
        return config;
      }
    }

    // 查找第一个可用的模型
    for (const config of this.configs.values()) {
      if (config.isAvailable) {
        return config;
      }
    }

    return null;
  }

  // 获取所有模型配置
  getAllModels(): AIModelConfig[] {
    return Array.from(this.configs.values());
  }

  // 更新模型配置
  updateModelConfig(modelId: string, updates: Partial<AIModelConfig>): void {
    const existing = this.configs.get(modelId);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.configs.set(modelId, updated);
      
      // 重新注册服务
      if (this.services.has(modelId)) {
        this.registerService(modelId, updated);
      }
    }
  }

  // 设置默认模型
  setDefaultModel(modelId: string): void {
    // 清除所有默认标记
    for (const config of this.configs.values()) {
      config.isDefault = false;
    }
    
    // 设置新的默认模型
    const config = this.configs.get(modelId);
    if (config) {
      config.isDefault = true;
    }
  }

  // 保存配置到localStorage
  saveConfigs(): void {
    try {
      const configs = Array.from(this.configs.entries()).map(([id, config]) => ({ modelId: id, ...config }));
      localStorage.setItem('ai-model-configs', JSON.stringify(configs));
    } catch (error) {
      console.error('Failed to save AI model configs:', error);
    }
  }

  // 从localStorage加载配置
  loadConfigs(): void {
    try {
      const saved = localStorage.getItem('ai-model-configs');
      if (saved) {
        const configs = JSON.parse(saved);
        configs.forEach((config: any) => {
          if (config.modelId) {
            // 保留内部状态，只更新用户配置
            const existing = this.configs.get(config.modelId);
            if (existing) {
              this.updateModelConfig(config.modelId, {
                apiKey: config.apiKey,
                baseURL: config.baseURL,
                isDefault: config.isDefault
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load AI model configs:', error);
    }
  }
}

// 单例实例
export const aiModelManager = new AIModelManager();

// 启动时加载配置
aiModelManager.loadConfigs();