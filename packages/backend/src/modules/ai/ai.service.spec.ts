import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { generateText, jsonSchema, stepCountIs, streamText, tool } from 'ai';
import { ToolDefinition } from '../agent-tools/types/tool.types';
import { AIService, AIToolCallingError } from './ai.service';
import { ModelConfigService } from './model-config.service';
import { AIProviderFactory } from './providers/ai-provider.factory';

jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn(),
  jsonSchema: jest.fn((schema) => schema),
  stepCountIs: jest.fn((count: number) => `step:${count}`),
  tool: jest.fn((value) => value),
}));

describe('AIService', () => {
  let service: AIService;
  let providerFactory: jest.Mocked<
    Pick<AIProviderFactory, 'resolveModel' | 'getAllProviderStatus'>
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        {
          provide: AIProviderFactory,
          useValue: {
            resolveModel: jest.fn().mockReturnValue({
              model: { id: 'fake-model' },
              config: { model: 'fake-model' },
            }),
            getAllProviderStatus: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ModelConfigService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(AIService);
    providerFactory = module.get(AIProviderFactory);
    configService = module.get(ConfigService);
    configService.get.mockImplementation((key: string, fallback?: unknown) => fallback as any);
    (generateText as jest.Mock).mockReset();
    (streamText as jest.Mock).mockReset();
    (jsonSchema as jest.Mock).mockClear();
    (stepCountIs as jest.Mock).mockClear();
    (tool as jest.Mock).mockClear();
  });

  it('uses generateText for normal chat calls', async () => {
    (generateText as jest.Mock).mockResolvedValue({
      text: 'hello',
      usage: {
        promptTokens: 3,
        completionTokens: 4,
        totalTokens: 7,
      },
      finishReason: 'stop',
    });

    const result = await service.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      provider: 'openai',
    });

    expect(providerFactory.resolveModel).toHaveBeenCalledWith(undefined, 'openai');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    );
    expect(result).toEqual({
      content: 'hello',
      usage: {
        promptTokens: 3,
        completionTokens: 4,
        totalTokens: 7,
      },
      finishReason: 'stop',
    });
  });

  it('registers tools and forwards tool-calling settings to generateText', async () => {
    (generateText as jest.Mock).mockResolvedValue({
      text: 'done',
      finishReason: 'stop',
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
      totalUsage: {
        promptTokens: 4,
        completionTokens: 5,
        totalTokens: 9,
      },
      warnings: [],
      steps: [
        {
          stepNumber: 0,
          finishReason: 'stop',
          toolCalls: [{ toolName: 'update_component_props' }],
        },
      ],
    });

    const definitions: ToolDefinition[] = [
      {
        name: 'update_component_props',
        description: 'update props',
        inputSchema: {
          type: 'object',
          properties: {
            componentId: { type: 'string' },
          },
          required: ['componentId'],
          additionalProperties: false,
        },
        visibility: 'agent',
        execute: jest.fn(),
      },
    ];

    const result = await service.runToolCalling({
      system: 'system',
      prompt: 'prompt',
      provider: 'openai',
      timeoutMs: 15000,
      maxSteps: 6,
      maxToolCalls: 8,
      toolDefinitions: definitions,
      executeTool: jest.fn().mockResolvedValue({ ok: true }),
    });

    expect(jsonSchema).toHaveBeenCalledWith(definitions[0].inputSchema);
    expect(tool).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'update props',
      }),
    );
    expect(stepCountIs).toHaveBeenCalledWith(6);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'system',
        prompt: 'prompt',
        activeTools: ['update_component_props'],
        timeout: 15000,
      }),
    );
    expect(result.toolCallCount).toBe(0);
    expect(result.finishReason).toBe('stop');
  });

  it('forwards step and tool-call lifecycle events to callbacks', async () => {
    (generateText as jest.Mock).mockImplementation(async (input) => {
      input.experimental_onToolCallStart?.({
        stepNumber: 0,
        toolCall: { toolName: 'update_component_props' },
      });
      input.experimental_onToolCallFinish?.({
        stepNumber: 0,
        toolCall: { toolName: 'update_component_props' },
        success: true,
      });
      input.onStepFinish?.({
        stepNumber: 0,
        finishReason: 'stop',
        toolCalls: [{ toolName: 'update_component_props' }],
      });

      return {
        text: 'done',
        finishReason: 'stop',
        usage: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        totalUsage: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
      };
    });

    const onStepFinish = jest.fn();
    const onToolCallStart = jest.fn();
    const onToolCallFinish = jest.fn();

    const result = await service.runToolCalling({
      system: 'system',
      prompt: 'prompt',
      provider: 'openai',
      timeoutMs: 15000,
      maxSteps: 6,
      maxToolCalls: 8,
      toolDefinitions: [
        {
          name: 'update_component_props',
          description: 'update props',
          inputSchema: { type: 'object', additionalProperties: false },
          visibility: 'agent',
          execute: jest.fn(),
        },
      ],
      executeTool: jest.fn().mockResolvedValue({ ok: true }),
      onStepFinish,
      onToolCallStart,
      onToolCallFinish,
    });

    expect(onToolCallStart).toHaveBeenCalledWith({
      stepNumber: 0,
      toolCall: { toolName: 'update_component_props' },
    });
    expect(onToolCallFinish).toHaveBeenCalledWith({
      stepNumber: 0,
      toolCall: { toolName: 'update_component_props' },
      success: true,
    });
    expect(onStepFinish).toHaveBeenCalledWith({
      stepNumber: 0,
      finishReason: 'stop',
      toolCalls: [{ toolName: 'update_component_props' }],
    });
    expect(result.toolCallCount).toBe(1);
  });

  it('maps abort-like failures to AIToolCallingError timeout', async () => {
    const abortError = new Error('request aborted');
    abortError.name = 'AbortError';
    (generateText as jest.Mock).mockRejectedValue(abortError);

    await expect(
      service.runToolCalling({
        system: 'system',
        prompt: 'prompt',
        provider: 'openai',
        timeoutMs: 15000,
        maxSteps: 6,
        maxToolCalls: 8,
        toolDefinitions: [],
        executeTool: jest.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AIToolCallingError',
        reason: 'timeout',
      } satisfies Partial<AIToolCallingError>),
    );
  });

  it('maps SDK failures to AIToolCallingError policy errors', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('sdk failed'));

    await expect(
      service.runToolCalling({
        system: 'system',
        prompt: 'prompt',
        provider: 'openai',
        timeoutMs: 15000,
        maxSteps: 6,
        maxToolCalls: 8,
        toolDefinitions: [],
        executeTool: jest.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AIToolCallingError',
        reason: 'policy',
        message: 'sdk failed',
      } satisfies Partial<AIToolCallingError>),
    );
  });
});
