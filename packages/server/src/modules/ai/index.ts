/**
 * AI 模块导出
 */

export { AiModule } from './ai.module';
export { AIService } from './ai.service';
export { AIController } from './ai.controller';

// Provider 导出
export { AIProviderFactory, ProviderType } from './providers/ai-provider.factory';
export {
  IAIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ChatMessage,
  ProviderConfig,
} from './providers/ai-provider.interface';

// DTO 导出
export {
  ChatRequestDto,
  ChatMessageDto,
  GenerateSchemaDto,
  MessageRole,
} from './dto/chat-request.dto';
