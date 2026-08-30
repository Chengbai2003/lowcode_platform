/**
 * AI Provider Factory 单元测试
 *
 * 覆盖当前公开能力：
 * - getAllProviderStatus()：结构、可用性判定与损坏配置 fail-close
 * - resolveModel(modelId) / resolveModel(undefined, providerName)
 * - 自定义模型（ModelConfigService）优先于环境 Provider
 * - 未知 model / provider fail-close
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { ModelConfigService } from './model-config.service';

/**
 * 环境配置采用实现真实读取的嵌套结构：configService.get('ai.openai') 返回完整对象，
 * 而非 'ai.openai.apiKey' 这类扁平键。
 */
const baseProviderConfigs: Record<string, any> = {
  'ai.defaultProvider': 'openai',
  'ai.openai': {
    apiKey: 'test-openai-key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
  },
  'ai.anthropic': {
    apiKey: 'test-anthropic-key',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-3-sonnet',
  },
  'ai.ollama': {
    baseURL: 'http://localhost:11434',
    model: 'llama3.2',
  },
};

describe('AIProviderFactory', () => {
  let factory: AIProviderFactory;
  let modelConfigService: { getModel: jest.Mock; getAllModels: jest.Mock };

  /**
   * 创建 factory 实例；可通过 overrides 覆盖/删除特定配置项
   * （值为 undefined 表示删除该配置，用于验证 fail-close 行为）
   */
  const createFactory = async (
    configOverrides?: Record<string, any>,
    modelConfigOverrides?: Partial<{ getModel: jest.Mock }>,
  ): Promise<void> => {
    const configs: Record<string, any> = { ...baseProviderConfigs, ...configOverrides };
    for (const key of Object.keys(configs)) {
      if (configs[key] === undefined) delete configs[key];
    }

    const modelConfigServiceMock = {
      getModel: jest.fn(),
      getAllModels: jest.fn().mockReturnValue([]),
      ...(modelConfigOverrides ?? {}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIProviderFactory,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configs[key]) },
        },
        {
          provide: ModelConfigService,
          useValue: modelConfigServiceMock,
        },
      ],
    }).compile();

    factory = module.get<AIProviderFactory>(AIProviderFactory);
    modelConfigService = module.get(ModelConfigService);
  };

  beforeEach(async () => {
    await createFactory();
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

  describe('getAllProviderStatus', () => {
    it('应该返回所有 provider 的状态结构', () => {
      const status = factory.getAllProviderStatus();
      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBe(3);

      const firstStatus = status[0];
      expect(firstStatus).toHaveProperty('name');
      expect(firstStatus).toHaveProperty('available');
      expect(firstStatus).toHaveProperty('config');
    });

    it('应该按嵌套环境配置正确判定可用性', () => {
      const status = factory.getAllProviderStatus();
      const byName = new Map(status.map((s) => [s.name, s]));

      // 有 apiKey 的环境 provider 可用，且配置来自完整的 'ai.openai' 对象
      expect(byName.get('openai')?.available).toBe(true);
      expect(byName.get('openai')?.config?.model).toBe('gpt-4o-mini');
      expect(byName.get('openai')?.config?.apiKey).toBe('test-openai-key');

      expect(byName.get('anthropic')?.available).toBe(true);
      expect(byName.get('anthropic')?.config?.model).toBe('claude-3-sonnet');

      // ollama 不需要 apiKey，仅凭 baseURL/model 即可用
      expect(byName.get('ollama')?.available).toBe(true);
      expect(byName.get('ollama')?.config?.apiKey).toBe('');
      expect(byName.get('ollama')?.config?.model).toBe('llama3.2');
    });

    it('配置缺失或损坏时不泄漏残缺配置', async () => {
      // openai 配置整体缺失、ollama 缺少 model 字段（实现要求 model 必须存在）
      await createFactory({
        'ai.openai': undefined,
        'ai.ollama': { baseURL: 'http://localhost:11434' },
      });
      const byName = new Map(factory.getAllProviderStatus().map((s) => [s.name, s]));

      // openai 配置整体缺失：不可用且无配置泄漏
      expect(byName.get('openai')?.available).toBe(false);
      expect(byName.get('openai')?.config).toBeUndefined();

      // ollama 可用性不依赖 apiKey（保持 true），但残缺配置（缺 model）不会被泄漏
      expect(byName.get('ollama')?.config).toBeUndefined();
    });
  });

  describe('resolveModel', () => {
    it('应该根据 modelId 解析环境 provider 配置', () => {
      const { model, config } = factory.resolveModel('openai');

      expect(model).toBeDefined();
      expect(config.apiKey).toBe('test-openai-key');
      expect(config.model).toBe('gpt-4o-mini');
      expect(config.baseURL).toBe('https://api.openai.com/v1');
    });

    it('不传参数时应该使用默认 provider', () => {
      const { config } = factory.resolveModel();

      expect(config.model).toBe('gpt-4o-mini');
    });

    it('resolveModel(undefined, providerName) 应该解析指定 provider', () => {
      const { model, config } = factory.resolveModel(undefined, 'anthropic');

      expect(model).toBeDefined();
      expect(config.apiKey).toBe('test-anthropic-key');
      expect(config.model).toBe('claude-3-sonnet');
    });

    it('自定义模型应该优先于环境 provider 配置', () => {
      const customModel = {
        id: 'my-model',
        name: 'My Model',
        provider: 'openai',
        apiKey: 'custom-key',
        model: 'custom-gpt',
        createdAt: 1,
        updatedAt: 1,
      };
      modelConfigService.getModel.mockReturnValue(customModel);

      const { model, config } = factory.resolveModel('my-model');

      expect(modelConfigService.getModel).toHaveBeenCalledWith('my-model');
      expect(model).toBeDefined();
      expect(config).toEqual(customModel);
      expect(config.apiKey).toBe('custom-key');
      expect(config.model).toBe('custom-gpt');
    });

    it('自定义模型 id 与默认 provider 同名时仍然优先', () => {
      const customModel = {
        id: 'openai',
        name: 'Custom OpenAI',
        provider: 'openai',
        apiKey: 'custom-key',
        model: 'custom-gpt',
        createdAt: 1,
        updatedAt: 1,
      };
      modelConfigService.getModel.mockReturnValue(customModel);

      const { config } = factory.resolveModel('openai');

      expect(config).toEqual(customModel);
    });

    it('未知 modelId 应该 fail-close 抛出错误', () => {
      modelConfigService.getModel.mockReturnValue(undefined);

      expect(() => factory.resolveModel('nonexistent-model')).toThrow(
        /Model config 'nonexistent-model' not found/,
      );
    });

    it('未知 provider 应该 fail-close 抛出错误', () => {
      expect(() => factory.resolveModel(undefined, 'nonexistent-provider')).toThrow(
        /Provider 'nonexistent-provider' not configured/,
      );
    });

    it('环境配置缺少 model 字段时应该 fail-close 抛出错误', async () => {
      await createFactory({ 'ai.openai': { apiKey: 'broken-key' } });

      expect(() => factory.resolveModel('openai')).toThrow(/Model config 'openai' not found/);
    });
  });
});
