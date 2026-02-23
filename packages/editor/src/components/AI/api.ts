import { AIModelConfig } from './types';

const BASE_URL = '/api/v1/ai';

export const aiApi = {
  // 获取所有模型配置
  async getModels(): Promise<AIModelConfig[]> {
    try {
      const response = await fetch(`${BASE_URL}/models`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      // Check if data is wrapped in a standard response format (e.g., data.data)
      if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
        return data.data;
      }
      if (Array.isArray(data)) {
        return data;
      }
      console.warn('Unexpected response format for models:', data);
      return [];
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  },

  // 保存模型配置 (新增或更新)
  async saveModel(config: AIModelConfig): Promise<AIModelConfig> {
    const response = await fetch(`${BASE_URL}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save model');
    }

    const data = await response.json();
    if (data && typeof data === 'object' && 'data' in data) {
      return data.data;
    }
    return data;
  },

  // 删除模型配置
  async deleteModel(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/models/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error('Failed to delete model');
      return true;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  }
};
