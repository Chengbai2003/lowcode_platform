import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ProviderConfig } from './providers/ai-provider.interface';

export interface AIModelConfigEntity extends ProviderConfig {
  id: string;
  name: string;
  provider: string; // 'openai', 'anthropic', 'ollama'
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class ModelConfigService implements OnModuleInit {
  private readonly logger = new Logger(ModelConfigService.name);
  private readonly configFilePath = path.resolve(process.cwd(), 'ai-models.json');
  private models: Map<string, AIModelConfigEntity> = new Map();

  onModuleInit() {
    this.loadModels();
  }

  /**
   * 加载模型配置
   */
  private loadModels() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const content = fs.readFileSync(this.configFilePath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          this.models.clear();
          data.forEach((model) => this.models.set(model.id, model));
          this.logger.log(
            `Loaded ${this.models.size} custom AI models from ${this.configFilePath}`,
          );
        }
      } else {
        this.logger.log(
          `No custom model config file found at ${this.configFilePath}, created empty.`,
        );
        this.saveToFile();
      }
    } catch (error) {
      this.logger.error('Failed to load model configs:', error);
    }
  }

  /**
   * 保存到文件
   */
  private saveToFile() {
    try {
      const data = Array.from(this.models.values());
      fs.writeFileSync(this.configFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save model configs to file:', error);
    }
  }

  /**
   * 获取所有模型
   */
  getAllModels(): AIModelConfigEntity[] {
    return Array.from(this.models.values());
  }

  /**
   * 获取单个模型
   */
  getModel(id: string): AIModelConfigEntity | undefined {
    return this.models.get(id);
  }

  /**
   * 保存模型（新增或更新）
   */
  saveModel(config: Partial<AIModelConfigEntity> & { id: string }): AIModelConfigEntity {
    const existing = this.models.get(config.id);
    const now = Date.now();

    const newModel: AIModelConfigEntity = {
      ...(existing || {}),
      ...config,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    } as AIModelConfigEntity;

    this.models.set(newModel.id, newModel);

    // 如果设置为默认，取消其他模型的默认状态
    if (newModel.isDefault) {
      this.models.forEach((model) => {
        if (model.id !== newModel.id) {
          model.isDefault = false;
        }
      });
    }

    this.saveToFile();
    return newModel;
  }

  /**
   * 删除模型
   */
  deleteModel(id: string): boolean {
    const result = this.models.delete(id);
    if (result) {
      this.saveToFile();
    }
    return result;
  }
}
