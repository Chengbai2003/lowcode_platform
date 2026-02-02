import type { AIModelConfig, AIService, AIRequest, AIResponse } from './types';
import type { A2UISchema } from '@lowcode-platform/renderer';
import { AIServiceError } from './types';

// OpenAI 服务实现
export class OpenAIService implements AIService {
  name = 'OpenAI';
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: AIModelConfig) {
    if (!config.apiKey) {
      throw new AIServiceError('OpenAI API key is required', 'API_KEY_MISSING');
    }
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      const messages = this.buildMessages(request);
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: request.options?.temperature || 0.7,
          max_tokens: request.options?.maxTokens || 2000,
        }),
      });

      if (!response.ok) {
        throw new AIServiceError(`OpenAI API error: ${response.statusText}`, 'NETWORK_ERROR');
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new AIServiceError('Invalid response from OpenAI', 'INVALID_RESPONSE');
      }

      return this.parseAIResponse(content, request);
    } catch (error: any) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError(`OpenAI service error: ${error.message || 'Unknown error'}`, 'NETWORK_ERROR', error);
    }
  }

  private buildMessages(request: AIRequest): Array<{ role: string; content: string }> {
    const systemPrompt = `你是一个专业的低代码平台AI助手，专门帮助用户生成、分析和优化UI界面。

你的能力包括：
1. 根据自然语言描述生成A2UI Schema格式的JSON结构
2. 分析现有Schema并提供优化建议
3. 理解UI设计原则和最佳实践

A2UI Schema格式：
{
  "rootId": "root",
  "components": {
    "componentId": {
      "id": "componentId",
      "type": "ComponentType",
      "props": { /* 组件属性 */ },
      "childrenIds": ["child1", "child2"],
      "events": { "onClick": "处理代码" }
    }
  }
}

请始终以以下格式回复：
**说明**：[对生成内容的详细说明]
**Schema**：[JSON格式的A2UI Schema]
**建议**：[可选的优化建议列表]`;

    const messages = [{ role: 'system', content: systemPrompt }];

    // 添加上下文
    if (request.context?.currentSchema) {
      messages.push({
        role: 'user',
        content: `当前Schema：\n\`\`\`json\n${JSON.stringify(request.context.currentSchema, null, 2)}\n\`\`\``
      });
    }

    // 添加用户请求
    messages.push({
      role: 'user',
      content: request.prompt
    });

    return messages;
  }

  private parseAIResponse(content: string, request: AIRequest): AIResponse {
    // 解析AI响应，提取说明、Schema和建议
    const explanationMatch = content.match(/\*\*说明\*\*：([\s\S]*?)(?=\*\*|$)/);
    const schemaMatch = content.match(/\*\*Schema\*\*：([\s\S]*?)(?=\*\*|$)/);
    const suggestionsMatch = content.match(/\*\*建议\*\*：([\s\S]*?)(?=\*\*|$)/);

    let schema: A2UISchema | undefined;
    try {
      if (schemaMatch) {
        const jsonStr = schemaMatch[1].trim().replace(/```json\n?|\n?```/g, '');
        schema = JSON.parse(jsonStr);
      }
    } catch (error) {
      console.warn('Failed to parse AI generated schema:', error);
    }

    const suggestions = suggestionsMatch 
      ? suggestionsMatch[1].split('\n').filter(s => s.trim()).map(s => s.replace(/^[-*]\s*/, ''))
      : [];

    return {
      content: explanationMatch?.[1]?.trim() || content,
      schema,
      suggestions,
    };
  }

  async analyzeSchema(schema: A2UISchema): Promise<{ analysis: string; issues: string[]; suggestions: string[] }> {
    const request: AIRequest = {
      prompt: '请分析这个UI设计，评估其结构、可用性和最佳实践遵循情况。',
      context: { currentSchema: schema }
    };

    const response = await this.generateResponse(request);
    
    return {
      analysis: response.content,
      issues: [],
      suggestions: response.suggestions || []
    };
  }

  async optimizeSchema(schema: A2UISchema): Promise<{ optimizedSchema: A2UISchema; suggestions: string[] }> {
    const request: AIRequest = {
      prompt: '请优化这个UI设计，提升用户体验、性能和代码质量。',
      context: { currentSchema: schema }
    };

    const response = await this.generateResponse(request);
    
    return {
      optimizedSchema: response.schema || schema,
      suggestions: response.suggestions || []
    };
  }
}

// Anthropic Claude服务实现
export class AnthropicService implements AIService {
  name = 'Anthropic Claude';
  private apiKey: string;

  constructor(config: AIModelConfig) {
    if (!config.apiKey) {
      throw new AIServiceError('Anthropic API key is required', 'API_KEY_MISSING');
    }
    this.apiKey = config.apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    // 类似OpenAI的实现，但使用Anthropic的API
    throw new AIServiceError('Anthropic service not implemented yet', 'MODEL_NOT_AVAILABLE');
  }
}