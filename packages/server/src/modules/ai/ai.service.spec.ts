import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { ModelConfigService } from './model-config.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ChatRequestDto, GenerateSchemaDto, MessageRole } from './dto/chat-request.dto';
import { IAIProvider } from './providers/ai-provider.interface';
import { of, throwError } from 'rxjs';

describe('AIService', () => {
  let service: AIService;
  let providerFactory: jest.Mocked<AIProviderFactory>;
  let configService: jest.Mocked<ConfigService>;
  let modelConfigService: jest.Mocked<ModelConfigService>;

  beforeEach(async () => {
    // 创建 Mock 实例
    const mockProviderFactory = {
      getProvider: jest.fn(),
      getAvailableProviders: jest.fn(),
      getAllProviderStatus: jest.fn(),
      createProviderInstance: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockModelConfigService = {
      getModel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: AIProviderFactory, useValue: mockProviderFactory },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ModelConfigService, useValue: mockModelConfigService },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    providerFactory = module.get(AIProviderFactory);
    configService = module.get(ConfigService);
    modelConfigService = module.get(ModelConfigService);

    // 默认配置返回值
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'ai.defaultProvider') return 'openai';
      if (key === 'ai.codegen.maxTokens') return 8192;
      return defaultValue;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chat', () => {
    it('should successfully call provider.chat', async () => {
      const mockProvider: Partial<IAIProvider> = {
        name: 'openai',
        isAvailable: true,
        chat: jest.fn().mockResolvedValue({
          id: '1', object: 'chat.completion', created: 123, model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
        }),
      };
      providerFactory.getProvider.mockReturnValue(mockProvider as IAIProvider);

      const dto: ChatRequestDto = {
        messages: [{ role: MessageRole.USER, content: 'Hi' }],
        provider: 'openai',
      };

      const result = await service.chat(dto);

      expect(providerFactory.getProvider).toHaveBeenCalledWith('openai');
      expect(mockProvider.chat).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(result.choices[0].message.content).toBe('Hello world');
    });

    it('should throw BadRequestException if provider not found', async () => {
      providerFactory.getProvider.mockReturnValue(undefined);

      const dto: ChatRequestDto = {
        messages: [{ role: MessageRole.USER, content: 'Hi' }],
        provider: 'unknown',
      };

      await expect(service.chat(dto)).rejects.toThrow(BadRequestException);
    });

    it('should use custom model config when modelId is provided', async () => {
      const mockModelConfig = { provider: 'openai', id: 'custom-model' };
      modelConfigService.getModel.mockReturnValue(mockModelConfig as any);

      const mockBaseProvider = { name: 'openai' };
      providerFactory.getProvider.mockReturnValue(mockBaseProvider as any);

      const mockProviderInstance = {
        name: 'custom-model',
        isAvailable: true,
        chat: jest.fn().mockResolvedValue({
          id: '2', object: 'chat', created: 123, model: 'custom',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Custom Hello' }, finish_reason: 'stop' }],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
        })
      };
      providerFactory.createProviderInstance.mockReturnValue(mockProviderInstance as any);

      const dto: ChatRequestDto = {
        messages: [{ role: MessageRole.USER, content: 'Hi' }],
        modelId: 'custom-model',
      };

      const result = await service.chat(dto);

      expect(modelConfigService.getModel).toHaveBeenCalledWith('custom-model');
      expect(providerFactory.createProviderInstance).toHaveBeenCalledWith('openai', mockModelConfig);
      expect(result.choices[0].message.content).toBe('Custom Hello');
    });
  });

  describe('generateSchema', () => {
    it('should build correct messages and call provider', async () => {
      const mockProvider: Partial<IAIProvider> = {
        name: 'anthropic',
        isAvailable: true,
        chat: jest.fn().mockResolvedValue({
          id: '3', object: 'chat', created: 123, model: 'anthropic',
          choices: [{ index: 0, message: { role: 'assistant', content: '{"rootId": "1"}' }, finish_reason: 'stop' }],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
        }),
      };
      providerFactory.getProvider.mockReturnValue(mockProvider as IAIProvider);

      const dto: GenerateSchemaDto = {
        description: 'A login form',
        provider: 'anthropic',
      };

      const result = await service.generateSchema(dto);

      expect(mockProvider.chat).toHaveBeenCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          { role: 'user', content: 'Generate a UI schema for: A login form' }
        ]),
        temperature: 0.2
      }));
      expect(result.choices[0].message.content).toContain('rootId');
    });
  });
});
