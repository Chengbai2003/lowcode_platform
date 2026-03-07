/**
 * AI 配置
 * 支持多Provider配置，包括OpenAI、Anthropic、本地模型等
 */

import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  // 默认Provider
  defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',

  // 全局配置
  timeout: parseInt(process.env.AI_TIMEOUT || '60000', 10) || 60000,
  maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3', 10) || 3,
  enableStreaming: process.env.AI_ENABLE_STREAMING !== 'false',

  // OpenAI 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7') || 0.7,
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10) || 4096,
  },

  // Anthropic (Claude) 配置
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
    temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.7') || 0.7,
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096', 10) || 4096,
  },

  // Ollama (本地模型) 配置
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7') || 0.7,
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '4096', 10) || 4096,
  },

  // 自定义 OpenAI 兼容服务
  // 支持 SiliconFlow, DeepSeek, Azure, OneAPI 等
  custom: parseCustomProviders(),

  // 代码生成专用配置
  codegen: {
    systemPrompt: process.env.CODEGEN_SYSTEM_PROMPT || `You are a code generator for a low-code platform.
Your task is to generate JSON schema for UI components based on user requirements.
The schema follows the A2UI format with the following structure:
- rootId: the root component ID
- components: a flat map of components with their properties and childrenIds

Supported component types include: Page, Container, Button, Input, Form, Table, Card, etc.

Respond ONLY with valid JSON. Do not include markdown formatting or explanations.`,
    maxTokens: parseInt(process.env.CODEGEN_MAX_TOKENS || '8192', 10) || 8192,
    temperature: parseFloat(process.env.CODEGEN_TEMPERATURE || '0.2') || 0.2,
  },
}));

/**
 * 解析自定义 Provider 配置
 * 支持从环境变量动态配置多个 OpenAI 兼容服务
 */
function parseCustomProviders(): Record<string, any> {
  const providers: Record<string, any> = {};

  // 支持最多 10 个自定义 Provider
  for (let i = 1; i <= 10; i++) {
    const prefix = `CUSTOM_PROVIDER_${i}`;
    const name = process.env[`${prefix}_NAME`];

    if (name) {
      providers[name] = {
        name,
        apiKey: process.env[`${prefix}_API_KEY`] || '',
        baseURL: process.env[`${prefix}_BASE_URL`] || '',
        model: process.env[`${prefix}_MODEL`] || 'gpt-3.5-turbo',
        temperature: parseFloat(process.env[`${prefix}_TEMPERATURE`] || '0.7'),
        maxTokens: parseInt(process.env[`${prefix}_MAX_TOKENS`] || '4096', 10),
      };
    }
  }

  return providers;
}
