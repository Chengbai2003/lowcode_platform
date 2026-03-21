import { ConfigService } from '@nestjs/config';
import { AIService } from '../ai/ai.service';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../agent-tools/tool-registry.service';
import { ToolExecutionContext } from '../agent-tools/types/tool.types';
import { ModelConfigService } from '../ai/model-config.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ComponentMetaRegistry, FocusContextResult } from '../schema-context';
import type { A2UISchema } from '../schema-context';
import { AgentPolicyService } from './agent-policy.service';
import { AgentRunnerService } from './agent-runner.service';

function createBaseContext(): ToolExecutionContext {
  return {
    pageId: 'page-1',
    version: 3,
    resolvedVersion: 3,
    draftSchema: {
      version: 3,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['button'] },
        button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
      },
    },
    workingSchema: {
      version: 3,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['button'] },
        button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
      },
    },
    accumulatedPatch: [],
    warnings: [],
    traceId: 'agent-trace',
  };
}

function createFocusedResult(componentId = 'button'): FocusContextResult {
  return {
    mode: 'focused',
    schema: createBaseContext().workingSchema,
    componentList: ['Page', 'Button'],
    context: {
      focusNode: {
        id: componentId,
        type: 'Button',
        props: { children: '旧文案' },
      },
      parent: {
        id: 'root',
        type: 'Page',
        childrenIds: ['button'],
      },
      ancestors: [],
      children: [],
      siblings: [],
      subtree: {
        [componentId]: {
          id: componentId,
          type: 'Button',
          props: { children: '旧文案' },
        },
      },
      schemaStats: {
        totalComponents: 2,
        maxDepth: 1,
        rootId: 'root',
        version: 3,
      },
      estimatedTokens: 12,
    },
  };
}

function createClarificationSchema(): A2UISchema {
  return {
    version: 3,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['card-primary', 'card-secondary'] },
      'card-primary': {
        id: 'card-primary',
        type: 'Card',
        props: { title: '主操作区' },
        childrenIds: ['button-a'],
      },
      'card-secondary': {
        id: 'card-secondary',
        type: 'Card',
        props: { title: '次操作区' },
        childrenIds: ['button-b'],
      },
      'button-a': { id: 'button-a', type: 'Button', props: { children: '提交' } },
      'button-b': { id: 'button-b', type: 'Button', props: { children: '保存' } },
    },
  };
}

describe('AgentRunnerService', () => {
  function createRunner() {
    const aiService: jest.Mocked<Pick<AIService, 'runToolCalling'>> = {
      runToolCalling: jest.fn(),
    };
    const toolExecutionService: jest.Mocked<
      Pick<ToolExecutionService, 'createExecutionContext' | 'getFocusContext' | 'executeTool'>
    > = {
      createExecutionContext: jest
        .fn()
        .mockImplementation(async (_input, traceId) => ({ ...createBaseContext(), traceId })),
      getFocusContext: jest.fn().mockResolvedValue(createFocusedResult()),
      executeTool: jest.fn(async (name, input, context) => {
        if (name === 'update_component_props') {
          const patch = {
            op: 'updateProps' as const,
            componentId: 'button',
            props: { children: '提交' },
          };
          context.accumulatedPatch = [...context.accumulatedPatch, patch];
          context.workingSchema = {
            ...context.workingSchema,
            components: {
              ...context.workingSchema.components,
              button: {
                ...context.workingSchema.components.button,
                props: { children: '提交' },
              },
            },
          };
          return {
            data: { ok: true },
            patchDelta: [patch],
            updatedWorkingSchema: context.workingSchema,
          };
        }

        if (name === 'auto_fix_patch') {
          context.warnings = [...context.warnings, 'auto-fixed'];
          return {
            data: { patch: input.patch },
            warnings: ['auto-fixed'],
          };
        }

        if (name === 'preview_patch') {
          context.workingSchema = {
            ...context.workingSchema,
            components: {
              ...context.workingSchema.components,
              button: {
                ...context.workingSchema.components.button,
                props: { children: '提交' },
              },
            },
          };
          return {
            data: { patch: input.patch },
            updatedWorkingSchema: context.workingSchema,
          };
        }

        return { data: {} };
      }),
    };
    const toolRegistry: jest.Mocked<Pick<ToolRegistryService, 'listDefinitions'>> = {
      listDefinitions: jest.fn().mockReturnValue([
        {
          name: 'update_component_props',
          description: 'update props',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          visibility: 'agent',
          execute: jest.fn(),
        },
      ] as any),
    };
    const configService: jest.Mocked<Pick<ConfigService, 'get'>> = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'ai.defaultProvider') {
          return 'openai';
        }
        return fallback as any;
      }),
    };
    const modelConfigService: jest.Mocked<Pick<ModelConfigService, 'getModel'>> = {
      getModel: jest.fn(),
    };
    const policyService = new AgentPolicyService(
      configService as unknown as ConfigService,
      modelConfigService as unknown as ModelConfigService,
    );
    const componentMetaRegistry = new ComponentMetaRegistry();

    const runner = new AgentRunnerService(
      aiService as unknown as AIService,
      toolExecutionService as unknown as ToolExecutionService,
      toolRegistry as unknown as ToolRegistryService,
      policyService,
      componentMetaRegistry,
    );

    return {
      runner,
      aiService,
      toolExecutionService,
    };
  }

  it('returns a patch when selectedId resolves exactly', async () => {
    const { runner, aiService, toolExecutionService } = createRunner();
    aiService.runToolCalling.mockImplementation(async (input) => {
      await input.executeTool('update_component_props', {
        componentId: 'button',
        props: { children: '提交' },
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    const result = await runner.runEdit(
      {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'patch',
      },
      'request-1',
    );

    expect(toolExecutionService.createExecutionContext).toHaveBeenCalled();
    expect(result.mode).toBe('patch');
    if (result.mode !== 'patch') {
      throw new Error('expected patch response');
    }
    expect(result.resolvedSelectedId).toBe('button');
    expect(result.patch).toEqual([
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '提交' },
      },
    ]);
    expect(result.previewSchema.components.button.props?.children).toBe('提交');
    expect(result.changeGroups).toHaveLength(1);
    expect(result.warnings).toContain('auto-fixed');
    expect(toolExecutionService.executeTool).toHaveBeenNthCalledWith(
      2,
      'auto_fix_patch',
      { patch: result.patch },
      expect.objectContaining({
        traceId: 'agent-request-1',
      }),
    );
    expect(toolExecutionService.executeTool).toHaveBeenNthCalledWith(
      3,
      'preview_patch',
      { patch: result.patch },
      expect.objectContaining({
        traceId: 'agent-request-1',
      }),
    );
    expect(aiService.runToolCalling).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('props.danger=true'),
      }),
    );
  });

  it('auto resolves a strong candidate before running the agent', async () => {
    const { runner, aiService, toolExecutionService } = createRunner();
    toolExecutionService.getFocusContext
      .mockResolvedValueOnce({
        mode: 'candidates',
        schema: createBaseContext().workingSchema,
        componentList: ['Page', 'Button'],
        candidates: [
          {
            id: 'button',
            type: 'Button',
            score: 0.72,
            reason: '文本匹配',
            matchType: 'prop_value',
          },
          { id: 'other', type: 'Button', score: 0.31, reason: '类型匹配', matchType: 'type' },
        ],
      } as any)
      .mockResolvedValueOnce(createFocusedResult());
    aiService.runToolCalling.mockImplementation(async (input) => {
      await input.executeTool('update_component_props', {
        componentId: 'button',
        props: { children: '提交' },
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    const result = await runner.runEdit(
      {
        instruction: '把提交按钮改一下',
        pageId: 'page-1',
        version: 3,
        responseMode: 'patch',
      },
      'request-2',
    );

    if (result.mode !== 'patch') {
      throw new Error('expected patch response');
    }
    expect(result.resolvedSelectedId).toBe('button');
    expect(toolExecutionService.getFocusContext).toHaveBeenCalledTimes(2);
  });

  it('returns clarification response when candidates are too close', async () => {
    const { runner, toolExecutionService } = createRunner();
    const clarificationSchema = createClarificationSchema();
    toolExecutionService.getFocusContext.mockResolvedValue({
      mode: 'candidates',
      schema: clarificationSchema,
      componentList: ['Page', 'Card', 'Button'],
      candidates: [
        {
          id: 'button-a',
          type: 'Button',
          score: 0.46,
          reason: '文本匹配',
          matchType: 'prop_value',
        },
        { id: 'button-b', type: 'Button', score: 0.4, reason: '文本匹配', matchType: 'prop_value' },
      ],
    } as any);

    const result = await runner.runEdit(
      {
        instruction: '把那个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        responseMode: 'patch',
      },
      'request-3',
    );

    expect(result.mode).toBe('clarification');
    if (result.mode !== 'clarification') {
      throw new Error('expected clarification response');
    }
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      id: 'button-a',
      displayLabel: '提交',
      secondaryLabel: '按钮',
      pathLabel: '页面 > 主操作区',
    });
    expect(result.candidates[1]).toMatchObject({
      id: 'button-b',
      displayLabel: '保存',
      secondaryLabel: '按钮',
      pathLabel: '页面 > 次操作区',
    });
    expect(result.content).toContain('提交（页面 > 主操作区）');
    expect(result.question).toContain('目标组件');
  });

  it('blocks runs that finish without producing a patch', async () => {
    const { runner, aiService } = createRunner();
    aiService.runToolCalling.mockResolvedValue({
      text: 'done',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      warnings: [],
      steps: [{ stepNumber: 0, finishReason: 'stop', toolCalls: [] }],
      toolCallCount: 0,
    });

    await expect(
      runner.runEdit(
        {
          instruction: '看看这个页面',
          pageId: 'page-1',
          version: 3,
          selectedId: 'button',
          responseMode: 'patch',
        },
        'request-4',
      ),
    ).rejects.toBeInstanceOf(AgentToolException);
  });

  it('logs real tool errors before the agent finishes with an empty patch', async () => {
    const { runner, aiService, toolExecutionService } = createRunner();
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    };
    (runner as any).logger = logger;

    toolExecutionService.executeTool.mockImplementation(async (name, _input, _context) => {
      if (name === 'update_component_props') {
        throw new AgentToolException({
          code: 'SCHEMA_INVALID',
          message: 'Schema contains orphaned components after patch application',
          traceId: 'agent-request-5',
          details: { orphanIds: ['ticketDetail', 'ticketLogs'] },
        });
      }

      if (name === 'auto_fix_patch') {
        return { data: { patch: [] } };
      }

      if (name === 'preview_patch') {
        return { data: { patch: [] } };
      }

      return { data: {} };
    });

    aiService.runToolCalling.mockImplementation(async (input) => {
      await input
        .executeTool('update_component_props', {
          componentId: 'button',
          props: { children: 'pass' },
        })
        .catch(() => undefined);
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    await expect(
      runner.runEdit(
        {
          instruction: '把通过按钮文本改为 pass',
          pageId: 'page-1',
          version: 3,
          responseMode: 'patch',
        },
        'request-5',
      ),
    ).rejects.toBeInstanceOf(AgentToolException);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'tool error name=update_component_props write=true code=SCHEMA_INVALID message=Schema contains orphaned components after patch application',
      ),
      expect.any(String),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('"orphanIds":["ticketDetail","ticketLogs"]'),
      expect.any(String),
    );
  });
});
