import type { AIModelConfig, AIService } from './types';
import { ServerAIService } from './ServerAIService';
import { MockAIService } from './mockService';

// AI模型管理器
export class AIModelManager {
  private configs: Map<string, AIModelConfig> = new Map();
  private serverService = new ServerAIService();
  private fallbackService = new MockAIService();
  private readonly baseUrl = '/api/v1/ai'; // 假设后端 API 前缀

  constructor() {
    // 初始加载配置
    this.loadConfigs();
  }

  // 获取当前激活的服务
  getActiveService(modelId?: string): AIService {
    if (!modelId || modelId === 'mock') {
      return this.fallbackService;
    }
    // 对于任何非 mock 模型，都使用通用的 ServerAIService
    // 由调用方负责在 request 中传递 modelId
    return this.serverService;
  }



  // 获取所有模型配置
  getAllModels(): AIModelConfig[] {
    return Array.from(this.configs.values());
  }

  // 新增：添加新模型
  async addModel(config: Omit<AIModelConfig, 'isAvailable'>): Promise<AIModelConfig> {
    const id = config.id || `${config.provider}-${Date.now()}`;
    const newConfig: AIModelConfig = {
      ...config,
      id,
      isAvailable: true // 服务端服务默认可用
    };

    try {
      // 保存到后端
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      if (!response.ok) {
        throw new Error('Failed to save model to server');
      }

      this.configs.set(id, newConfig);
      // Removed registerService call

      return newConfig;
    } catch (e) {
      console.error('Add model failed', e);
      throw e;
    }
  }

  // 更新模型配置
  async updateModelConfig(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    const existing = this.configs.get(modelId);
    if (existing) {
      const updated = { ...existing, ...updates };

      try {
        // 保存到后端
        const response = await fetch(`${this.baseUrl}/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        });

        if (!response.ok) {
          throw new Error('Failed to update model on server');
        }

        this.configs.set(modelId, updated);
      } catch (e) {
        console.error('Update model failed', e);
        throw e;
      }
    }
  }

  // 删除模型
  async deleteModel(modelId: string): Promise<boolean> {
    if (modelId === 'mock') return false;

    try {
      const response = await fetch(`${this.baseUrl}/models/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modelId })
      });

      if (!response.ok) { // 即使后端删除失败，前端也尝试清理? 暂时严格处理
        console.error('Failed to delete model on server');
        return false;
      }

      this.configs.delete(modelId);
      return true;
    } catch (e) {
      console.error('Delete model failed', e);
      return false;
    }
  }

  // 设置默认模型
  setDefaultModel(modelId: string): void {
    // 1. 本地更新状态
    for (const config of this.configs.values()) {
      config.isDefault = (config.id === modelId);
    }

    // 2. 异步同步到服务端 (可选，取决于是否需要持久化默认选择到服务端)
    // 这里我们假设默认选择是用户偏好，可以只保存在本地或者也同步到服务端
    // 为了简单起见，我们这里只更新内存，实际上如果服务端有 isDefault 字段，应该保存
    const config = this.configs.get(modelId);
    if (config) {
      this.updateModelConfig(modelId, { isDefault: true });
    }
  }

  // 从服务端加载配置
  async loadConfigs(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/models`);
      if (response.ok) {
        const models = await response.json();
        if (Array.isArray(models)) {
          // 清除除了 mock 之外的现有配置
          this.configs.clear();

          // 重新添加 mock
          // 实际上服务端可能不返回 mock，我们需要手动保留
          // 或者统一由服务端管理 mock（如果服务端有 mock provider）

          // 暂时策略：保留 mock，合并服务端数据

          // 预定义的本地 Mock
          const mockConfig: AIModelConfig = {
            id: 'mock',
            name: 'Mock AI (本地兜底)',
            provider: 'mock',
            model: 'mock',
            isDefault: models.length === 0, // 如果没有其他模型，Mock 为默认
            isAvailable: true,
          }
          this.configs.set('mock', mockConfig);

          models.forEach((model: any) => {
            // 转换服务端字段到前端字段 (如果字段名一致则直接使用)
            const config: AIModelConfig = {
              id: model.id,
              name: model.name,
              provider: model.provider,
              model: model.model, // 对应后端的 model 字段
              baseURL: model.baseURL,
              apiKey: model.apiKey, // 注意：通常不应该返回 apiKey 给前端，但这里是用户配置的，可能需要回显? 
              // 安全起见，服务端可能脱敏，前端只需要知道有 key
              isDefault: model.isDefault,
              isAvailable: true, // 假设服务端返回的都可用
            };
            this.configs.set(config.id, config);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load AI model configs from server:', error);
      // 加载失败时，至少保证 mock 可用
      if (!this.configs.has('mock')) {
        const mockConfig: AIModelConfig = {
          id: 'mock',
          name: 'Mock AI (本地兜底)',
          provider: 'mock',
          model: 'mock',
          isDefault: true,
          isAvailable: true,
        }
        this.configs.set('mock', mockConfig);
      }
    }
  }
}

// 单例实例
export const aiModelManager = new AIModelManager();

