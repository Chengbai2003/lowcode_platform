/**
 * AI Provider 配置类型
 * 保留用于 ModelConfigService 和动态 Provider 创建
 */

export type ProviderType = "openai" | "anthropic" | "ollama" | string;

/**
 * Provider 配置
 */
export interface ProviderConfig {
  apiKey?: string;
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  [key: string]: any;
}
