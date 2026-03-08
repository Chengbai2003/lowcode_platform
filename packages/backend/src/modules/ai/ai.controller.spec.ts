import { Test, TestingModule } from '@nestjs/testing';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { ModelConfigService } from './model-config.service';
import { ChatRequestDto, GenerateSchemaDto, MessageRole } from './dto/chat-request.dto';
import { Response } from 'express';
import { of, throwError } from 'rxjs';

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
    }).compile();

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

      aiService.chat.mockResolvedValue(expectedResult);

      const result = await controller.chat(dto);

      expect(aiService.chat).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('chatStream', () => {
    it('should set SSE headers and pipe stream to response', async () => {
      const dto: ChatRequestDto = { messages: [{ role: MessageRole.USER, content: 'test' }] };

      const mockStreamChunk = { choices: [{ delta: { content: 'hello' } }] };
      aiService.chatStream.mockReturnValue(of(mockStreamChunk as any));

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;

      await controller.chatStream(dto, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');

      // Verification that it writes to stream
      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(mockStreamChunk)}\n\n`,
      );
      expect(mockResponse.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });
});
