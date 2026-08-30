import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { ModelConfigService } from './model-config.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ChatRequestDto, MessageRole } from './dto/chat-request.dto';
import { Response } from 'express';

/**
 * 固定放行的 Guard：Controller 单测不重复覆盖鉴权，
 * 鉴权由 E2E（真实 AuthGuard + ConfigService）统一验证。
 */
class AllowAllAuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('AIController', () => {
  let controller: AIController;
  let aiService: jest.Mocked<AIService>;
  let modelConfigService: jest.Mocked<ModelConfigService>;

  beforeEach(async () => {
    // Mock AIService
    const mockAIService = {
      chat: jest.fn(),
      chatStream: jest.fn(),
      generateSchema: jest.fn(),
      generateSchemaStream: jest.fn(),
      getAvailableProviders: jest.fn(),
      getProviderHealth: jest.fn(),
      getAllProviderStatus: jest.fn(),
    };

    // Mock ModelConfigService
    const mockModelConfigService = {
      getAllModels: jest.fn(),
      saveModel: jest.fn(),
      deleteModel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AIController],
      providers: [
        { provide: AIService, useValue: mockAIService },
        { provide: ModelConfigService, useValue: mockModelConfigService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(AllowAllAuthGuard)
      .compile();

    controller = module.get<AIController>(AIController);
    aiService = module.get(AIService);
    modelConfigService = module.get(ModelConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should call aiService.chat and return the result', async () => {
      const dto: ChatRequestDto = { messages: [{ role: MessageRole.USER, content: 'test' }] };
      const expectedResult = {
        id: '123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test',
        choices: [
          {
            index: 0,
            message: { role: 'assistant' as const, content: 'response' },
            finish_reason: 'stop',
          },
        ],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };

      // @ts-expect-error 方法返回类型尚未完全匹配
      aiService.chat.mockResolvedValue(expectedResult);

      const result = await controller.chat(dto);

      expect(aiService.chat).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('chatStream', () => {
    it('should pipe the AI SDK text stream to the HTTP response', async () => {
      const dto: ChatRequestDto = { messages: [{ role: MessageRole.USER, content: 'test' }] };
      const pipeTextStreamToResponse = jest.fn();
      aiService.chatStream.mockResolvedValue({
        pipeTextStreamToResponse,
      } as any);

      const mockResponse = {} as unknown as Response;

      await controller.chatStream(dto, mockResponse);

      expect(aiService.chatStream).toHaveBeenCalledWith(dto);
      expect(pipeTextStreamToResponse).toHaveBeenCalledWith(mockResponse);
    });
  });
});
