/**
 * AI Provider Factory 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIProviderFactory } from './providers/ai-provider.factory';

describe('AIProviderFactory', () => {
  let factory: AIProviderFactory;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const configs: Record<string, any> = {
        'ai.defaultProvider': 'openai',
        'ai.openai.apiKey': 'test-openai-key',
        'ai.openai.baseURL': 'https://api.openai.com/v1',
        'ai.openai.model': 'gpt-4o-mini',
        'ai.openai.temperature': 0.7,
        'ai.openai.maxTokens': 4096,
        'ai.anthropic.apiKey': 'test-anthropic-key',
        'ai.anthropic.baseURL': 'https://api.anthropic.com',
        'ai.anthropic.model': 'claude-3-sonnet',
        'ai.anthropic.temperature': 0.7,
        'ai.ollama.baseURL': 'http://localhost:11434',
        'ai.ollama.model': 'llama3.2',
        'ai.custom': {},
      };
      return configs[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIProviderFactory,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    factory = module.get<AIProviderFactory>(AIProviderFactory);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    it('应该成功创建 factory 实例', () => {
      expect(factory).toBeDefined();
    });

    it('应该初始化所有内置 provider', () => {
      const providers = factory.getAllProviderStatus();
      const providerNames = providers.map((p) => p.name);

      expect(providerNames).toContain('openai');
      expect(providerNames).toContain('anthropic');
      expect(providerNames).toContain('ollama');
    });
  });

  describe.skip('getProvider', () => {
    it('应该返回指定的 provider', () => {
      // @ts-expect-error 方法尚未实现
      const provider = factory.getProvider('openai');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('openai');
    });

    it('对不存在的 provider 应该返回 undefined', () => {
      // @ts-expect-error 方法尚未实现
      const provider = factory.getProvider('nonexistent');
      expect(provider).toBeUndefined();
    });
  });

  describe.skip('getDefaultProvider', () => {
    it('应该返回默认 provider', () => {
      // @ts-expect-error 方法尚未实现
      const provider = factory.getDefaultProvider();
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });
  });

  describe.skip('getAvailableProviders', () => {
    it('应该返回所有可用的 provider', () => {
      // @ts-expect-error 方法尚未实现
      const providers = factory.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });
  });

  describe.skip('getAllProviderStatus', () => {
    it('应该返回所有 provider 的状态', () => {
      const status = factory.getAllProviderStatus();
      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);

      // 检查状态对象结构
      const firstStatus = status[0];
      expect(firstStatus).toHaveProperty('name');
      expect(firstStatus).toHaveProperty('available');
      expect(firstStatus).toHaveProperty('config');
    });
  });

  describe.skip('reloadProviders', () => {
    it('应该重新加载所有 provider', () => {
      const spy = jest.spyOn(factory as any, 'initializeProviders');
      // @ts-expect-error 方法尚未实现
      factory.reloadProviders();
      expect(spy).toHaveBeenCalled();
    });
  });
});
