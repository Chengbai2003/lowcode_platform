// AI Assistant Module
export { AIAssistant } from './AIAssistant';
export { AIConfig } from './AIConfig';
export { aiModelManager } from './manager';
export { OpenAIService, AnthropicService } from './services';
export { MockAIService } from './mockService';

// Types
export type {
  AIModelConfig,
  AIResponse,
  AIRequest,
  AIService,
  AIServiceError
} from './types';