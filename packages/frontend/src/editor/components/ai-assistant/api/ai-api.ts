import { AIModelConfig } from '../types/ai-types';
import { fetchApp } from '../../../lib/httpClient';

const BASE_URL = '/api/v1/ai';

export const aiApi = {
  // 获取所有模型配置
  async getModels(): Promise<AIModelConfig[]> {
    try {
      const data = await fetchApp.get<AIModelConfig[]>(`${BASE_URL}/models`);

      // 检查响应格式
      if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) {
        return (data as any).data;
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
    const data = await fetchApp.post<AIModelConfig>(`${BASE_URL}/models`, config);

    // 检查响应格式
    if (data && typeof data === 'object' && 'data' in data) {
      return (data as any).data;
    }

    return data;
  },

  // 删除模型配置 (使用 RESTful DELETE 方法)
  async deleteModel(id: string): Promise<boolean> {
    try {
      await fetchApp.delete(`${BASE_URL}/models/${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  },
};
