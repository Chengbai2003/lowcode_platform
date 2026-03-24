import { ConfigService } from '@nestjs/config';
import { AIService } from '../ai/ai.service';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../agent-tools/tool-registry.service';
import { ToolExecutionContext } from '../agent-tools/types/tool.types';
import { ModelConfigService } from '../ai/model-config.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ComponentMetaRegistry, FocusContextResult } from '../schema-context';
import type { A2UISchema } from '../schema-context';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import { AgentAnswerService } from './agent-answer.service';
import { AgentIdempotencyService } from './agent-idempotency.service';
import { AgentIntentConfirmationService } from './agent-intent-confirmation.service';
import { AgentIntentNormalizationService } from './agent-intent-normalization.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentMetricsService } from './agent-metrics.service';
import { AgentPolicyService } from './agent-policy.service';
import { AgentReadCacheService } from './agent-read-cache.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentScopeConfirmationService } from './agent-scope-confirmation.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentService } from './agent.service';
import { AgentSessionMemoryService } from './agent-session-memory.service';
import { AgentTraceService } from './agent-trace.service';

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

function createBatchSchema(): A2UISchema {
  return {
    version: 3,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['form'] },
      form: { id: 'form', type: 'Form', childrenIds: ['form-item-a', 'form-item-b'] },
      'form-item-a': {
        id: 'form-item-a',
        type: 'FormItem',
        props: { label: '用户名', labelWidth: 120 },
        childrenIds: ['input-a'],
      },
      'form-item-b': {
        id: 'form-item-b',
        type: 'FormItem',
        props: { label: '密码', labelWidth: 120 },
        childrenIds: ['input-b'],
      },
      'input-a': { id: 'input-a', type: 'Input', props: { placeholder: '请输入用户名' } },
      'input-b': { id: 'input-b', type: 'Input', props: { placeholder: '请输入密码' } },
    },
  };
}

function createBatchContext(): ToolExecutionContext {
  const schema = createBatchSchema();
  return {
    pageId: 'page-1',
    version: 3,
    resolvedVersion: 3,
    draftSchema: schema,
    workingSchema: schema,
    accumulatedPatch: [],
    warnings: [],
    traceId: 'agent-trace',
  };
}

function createMixedCollectionSchema(): A2UISchema {
  return {
    version: 3,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['primary-button', 'form'] },
      'primary-button': { id: 'primary-button', type: 'Button', props: { children: '提交' } },
      form: { id: 'form', type: 'Form', childrenIds: ['form-item-a', 'form-item-b'] },
      'form-item-a': {
        id: 'form-item-a',
        type: 'FormItem',
        props: { label: '用户名', labelWidth: 120 },
        childrenIds: ['input-a'],
      },
      'form-item-b': {
        id: 'form-item-b',
        type: 'FormItem',
        props: { label: '密码', labelWidth: 120 },
        childrenIds: ['input-b'],
      },
      'input-a': { id: 'input-a', type: 'Input', props: { placeholder: '请输入用户名' } },
      'input-b': { id: 'input-b', type: 'Input', props: { placeholder: '请输入密码' } },
    },
  };
}

function createMixedCollectionContext(): ToolExecutionContext {
  const schema = createMixedCollectionSchema();
  return {
    pageId: 'page-1',
    version: 3,
    resolvedVersion: 3,
    draftSchema: schema,
    workingSchema: schema,
    accumulatedPatch: [],
    warnings: [],
    traceId: 'agent-trace',
  };
}

function createFormFocusedResult(): FocusContextResult {
  const schema = createBatchSchema();
  return {
    mode: 'focused',
    schema,
    componentList: ['Page', 'Form', 'FormItem', 'Input'],
    context: {
      focusNode: {
        id: 'form',
        type: 'Form',
        childrenIds: ['form-item-a', 'form-item-b'],
      },
      parent: {
        id: 'root',
        type: 'Page',
        childrenIds: ['form'],
      },
      ancestors: [],
      children: [
        { id: 'form-item-a', type: 'FormItem', props: { label: '用户名', labelWidth: 120 } },
        { id: 'form-item-b', type: 'FormItem', props: { label: '密码', labelWidth: 120 } },
      ],
      siblings: [],
      subtree: {
        form: {
          id: 'form',
          type: 'Form',
          childrenIds: ['form-item-a', 'form-item-b'],
        },
        'form-item-a': {
          id: 'form-item-a',
          type: 'FormItem',
          props: { label: '用户名', labelWidth: 120 },
          childrenIds: ['input-a'],
        },
        'form-item-b': {
          id: 'form-item-b',
          type: 'FormItem',
          props: { label: '密码', labelWidth: 120 },
          childrenIds: ['input-b'],
        },
      },
      schemaStats: {
        totalComponents: 6,
        maxDepth: 3,
        rootId: 'root',
        version: 3,
      },
      estimatedTokens: 40,
    },
  };
}

function createRootFocusedResult(): FocusContextResult {
  const schema = createBatchSchema();
  return {
    mode: 'focused',
    schema,
    componentList: ['Page', 'Form', 'FormItem', 'Input'],
    context: {
      focusNode: {
        id: 'root',
        type: 'Page',
        childrenIds: ['form'],
      },
      parent: null,
      ancestors: [],
      children: [{ id: 'form', type: 'Form', childrenIds: ['form-item-a', 'form-item-b'] }],
      siblings: [],
      subtree: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['form'],
        },
      },
      schemaStats: {
        totalComponents: 6,
        maxDepth: 3,
        rootId: 'root',
        version: 3,
      },
      estimatedTokens: 24,
    },
  };
}

function createMixedRootFocusedResult(): FocusContextResult {
  const schema = createMixedCollectionSchema();
  return {
    mode: 'focused',
    schema,
    componentList: ['Page', 'Form', 'FormItem', 'Input', 'Button'],
    context: {
      focusNode: {
        id: 'root',
        type: 'Page',
        childrenIds: ['primary-button', 'form'],
      },
      parent: null,
      ancestors: [],
      children: [
        {
          id: 'primary-button',
          type: 'Button',
          props: { children: '提交' },
        },
        {
          id: 'form',
          type: 'Form',
          childrenIds: ['form-item-a', 'form-item-b'],
        },
      ],
      siblings: [],
      subtree: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['primary-button', 'form'],
        },
        'primary-button': {
          id: 'primary-button',
          type: 'Button',
          props: { children: '提交' },
        },
        form: {
          id: 'form',
          type: 'Form',
          childrenIds: ['form-item-a', 'form-item-b'],
        },
        'form-item-a': {
          id: 'form-item-a',
          type: 'FormItem',
          props: { label: '用户名', labelWidth: 120 },
          childrenIds: ['input-a'],
        },
        'form-item-b': {
          id: 'form-item-b',
          type: 'FormItem',
          props: { label: '密码', labelWidth: 120 },
          childrenIds: ['input-b'],
        },
        'input-a': {
          id: 'input-a',
          type: 'Input',
          props: { placeholder: '请输入用户名' },
        },
        'input-b': {
          id: 'input-b',
          type: 'Input',
          props: { placeholder: '请输入密码' },
        },
      },
      schemaStats: {
        totalComponents: 7,
        maxDepth: 3,
        rootId: 'root',
        version: 3,
      },
      estimatedTokens: 56,
    },
  };
}

describe('AgentRunnerService', () => {
  function createRunner(options?: {
    baseContext?: ToolExecutionContext;
    focusContextResult?: FocusContextResult;
    traceService?: AgentTraceService;
  }) {
    const baseContext = options?.baseContext ?? createBaseContext();
    const focusContextResult = options?.focusContextResult ?? createFocusedResult();
    const aiService: jest.Mocked<Pick<AIService, 'runToolCalling'>> = {
      runToolCalling: jest.fn(),
    };
    const toolExecutionService: jest.Mocked<
      Pick<ToolExecutionService, 'createExecutionContext' | 'getFocusContext' | 'executeTool'>
    > = {
      createExecutionContext: jest
        .fn()
        .mockImplementation(async (_input, traceId) => ({ ...baseContext, traceId })),
      getFocusContext: jest.fn().mockResolvedValue(focusContextResult),
      executeTool: jest.fn(async (name, input, context) => {
        if (name === 'resolve_collection_scope') {
          return {
            data: collectionTargetResolver.resolve({
              rootId: String(input.rootId ?? ''),
              instruction: String(input.instruction ?? ''),
              targetType: typeof input.targetType === 'string' ? input.targetType : undefined,
              schema: context.workingSchema,
            }),
          };
        }

        if (name === 'update_component_props') {
          const patch = {
            op: 'updateProps' as const,
            componentId: input.componentId as string,
            props: input.props as Record<string, unknown>,
          };
          context.accumulatedPatch = [...context.accumulatedPatch, patch];
          context.workingSchema = {
            ...context.workingSchema,
            components: {
              ...context.workingSchema.components,
              [patch.componentId]: {
                ...context.workingSchema.components[patch.componentId],
                props: {
                  ...(context.workingSchema.components[patch.componentId]?.props ?? {}),
                  ...patch.props,
                },
              },
            },
          };
          return {
            data: { ok: true },
            patchDelta: [patch],
            updatedWorkingSchema: context.workingSchema,
          };
        }

        if (name === 'update_components_props') {
          const patch = (input.componentIds as string[]).map((componentId) => ({
            op: 'updateProps' as const,
            componentId,
            props: input.props as Record<string, unknown>,
          }));
          context.accumulatedPatch = [...context.accumulatedPatch, ...patch];
          context.workingSchema = {
            ...context.workingSchema,
            components: patch.reduce(
              (acc, operation) => ({
                ...acc,
                [operation.componentId]: {
                  ...acc[operation.componentId],
                  props: {
                    ...(acc[operation.componentId]?.props ?? {}),
                    ...operation.props,
                  },
                },
              }),
              { ...context.workingSchema.components },
            ),
          };
          return {
            data: { ok: true },
            patchDelta: patch,
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
          const previewPatch = input.patch as Array<{
            op: 'updateProps';
            componentId: string;
            props: Record<string, unknown>;
          }>;
          context.workingSchema = {
            ...context.workingSchema,
            components: previewPatch.reduce(
              (acc, operation) => {
                if (operation.op !== 'updateProps') {
                  return acc;
                }

                return {
                  ...acc,
                  [operation.componentId]: {
                    ...acc[operation.componentId],
                    props: {
                      ...(acc[operation.componentId]?.props ?? {}),
                      ...operation.props,
                    },
                  },
                };
              },
              { ...context.workingSchema.components },
            ),
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
        {
          name: 'update_components_props',
          description: 'batch update props',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          visibility: 'agent',
          execute: jest.fn(),
        },
        {
          name: 'resolve_collection_scope',
          description: 'resolve collection scope',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          visibility: 'agent',
          execute: jest.fn(),
        },
        {
          name: 'get_component_meta',
          description: 'component meta',
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
    const collectionTargetResolver = new CollectionTargetResolverService(componentMetaRegistry);
    const intentNormalizationService = new AgentIntentNormalizationService(collectionTargetResolver);
    const intentConfirmationService = new AgentIntentConfirmationService();
    const scopeConfirmationService = new AgentScopeConfirmationService();
    const traceService = options?.traceService ?? new AgentTraceService();

    const runner = new AgentRunnerService(
      aiService as unknown as AIService,
      toolExecutionService as unknown as ToolExecutionService,
      toolRegistry as unknown as ToolRegistryService,
      policyService,
      componentMetaRegistry,
      collectionTargetResolver,
      intentNormalizationService,
      intentConfirmationService,
      scopeConfirmationService,
      traceService,
    );

    return {
      runner,
      aiService,
      toolExecutionService,
      scopeConfirmationService,
      intentConfirmationService,
      traceService,
    };
  }

  function createAgentServiceHarness(options?: {
    baseContext?: ToolExecutionContext;
    focusContextResult?: FocusContextResult;
    traceService?: AgentTraceService;
  }) {
    const runnerHarness = createRunner(options);
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn(),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'resolve' | 'createTraceId'>> = {
      resolve: jest.fn(async (dto: any, traceId: string) => ({
        traceId,
        route: {
          requestedMode: (dto.responseMode ?? 'patch') as
            | 'auto'
            | 'answer'
            | 'schema'
            | 'patch',
          resolvedMode: 'patch' as const,
          reason: (dto.selectedId ? 'selected_target' : 'default_edit_with_page_context') as
            | 'selected_target'
            | 'default_edit_with_page_context',
          manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
        },
      })),
      createTraceId: jest.fn((requestId?: string) =>
        requestId?.trim()
          ? requestId.startsWith('agent-')
            ? requestId
            : `agent-${requestId}`
          : 'agent-request',
      ),
    };
    const sessionMemoryService = new AgentSessionMemoryService();
    const readCacheService = new AgentReadCacheService();
    const idempotencyService = new AgentIdempotencyService();
    const agentService = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerHarness.runner,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService,
      readCacheService,
      idempotencyService,
      runnerHarness.traceService,
    );

    return {
      ...runnerHarness,
      agentService,
      answerService,
      legacySchemaService,
      routingService,
      sessionMemoryService,
      readCacheService,
      idempotencyService,
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
    expect(aiService.runToolCalling).not.toHaveBeenCalled();
  });

  it('uses fast path for simple text updates on a focused target', async () => {
    const { runner, aiService } = createRunner();

    const result = await runner.runEdit(
      {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'patch',
      },
      'request-fast-path',
    );

    expect(aiService.runToolCalling).not.toHaveBeenCalled();
    expect(result.mode).toBe('patch');
    if (result.mode !== 'patch') {
      throw new Error('expected patch response');
    }
    expect(result.patch).toEqual([
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '提交' },
      },
    ]);
    expect(result.retryCount).toBe(0);
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

  it('asks the user to select a container before collection edits without selectedId', async () => {
    const { runner } = createRunner();

    const result = await runner.runEdit(
      {
        instruction: '修改全部表单 label',
        pageId: 'page-1',
        version: 3,
        responseMode: 'patch',
      },
      'request-collection-clarify',
    );

    expect(result.mode).toBe('clarification');
    if (result.mode !== 'clarification') {
      throw new Error('expected clarification response');
    }
    expect(result.question).toContain('父级或祖先容器');
    expect(result.candidates).toEqual([]);
    expect(result.content).toContain('先选中父级或祖先容器');
  });

  it('returns intent confirmation before scope confirmation for ambiguous field semantics', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const result = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-1',
        responseMode: 'patch',
      },
      'request-intent-confirm-1',
    );

    expect(aiService.runToolCalling).not.toHaveBeenCalled();
    expect(result.mode).toBe('intent_confirmation');
    if (result.mode !== 'intent_confirmation') {
      throw new Error('expected intent confirmation response');
    }
    expect(result.options.map((option) => option.label)).toEqual(['表单项', '输入框']);
  });

  it('enters scope confirmation after the user confirms an intent option', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const intentResult = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-2',
        responseMode: 'patch',
      },
      'request-intent-confirm-2',
    );

    if (intentResult.mode !== 'intent_confirmation') {
      throw new Error('expected intent confirmation response');
    }

    const confirmedOption = intentResult.options.find((option) => option.label === '表单项');
    expect(confirmedOption).toBeDefined();

    const result = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-2',
        confirmedIntentId: confirmedOption!.intentId,
        responseMode: 'patch',
      },
      'request-intent-confirm-3',
    );

    expect(aiService.runToolCalling).not.toHaveBeenCalled();
    expect(result.mode).toBe('scope_confirmation');
    if (result.mode !== 'scope_confirmation') {
      throw new Error('expected scope confirmation response');
    }
    expect(result.scope).toEqual({
      rootId: 'form',
      matchedType: 'FormItem',
      matchedDisplayName: '表单项',
      targetIds: ['form-item-a', 'form-item-b'],
      targetCount: 2,
    });
  });

  it('keeps earlier intent confirmations valid when the same session queues another one', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const firstIntentResult = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-multi',
        responseMode: 'patch',
      },
      'request-intent-multi-1',
    );

    const secondIntentResult = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-multi',
        responseMode: 'patch',
      },
      'request-intent-multi-2',
    );

    expect(firstIntentResult.mode).toBe('intent_confirmation');
    expect(secondIntentResult.mode).toBe('intent_confirmation');
    if (
      firstIntentResult.mode !== 'intent_confirmation' ||
      secondIntentResult.mode !== 'intent_confirmation'
    ) {
      throw new Error('expected intent confirmation responses');
    }

    const firstConfirmedOption = firstIntentResult.options.find((option) => option.label === '表单项');
    expect(firstConfirmedOption).toBeDefined();

    const result = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-multi',
        confirmedIntentId: firstConfirmedOption!.intentId,
        responseMode: 'patch',
      },
      'request-intent-multi-3',
    );

    expect(aiService.runToolCalling).not.toHaveBeenCalled();
    expect(result.mode).toBe('scope_confirmation');
  });

  it('invalidates intent confirmation when the selected container changes before scope planning', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const intentResult = await runner.runEdit(
      {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-intent-invalid',
        responseMode: 'patch',
      },
      'request-intent-invalid-1',
    );

    if (intentResult.mode !== 'intent_confirmation') {
      throw new Error('expected intent confirmation response');
    }

    const confirmedOption = intentResult.options.find((option) => option.label === '表单项');
    expect(confirmedOption).toBeDefined();

    await expect(
      runner.runEdit(
        {
          instruction: '把所有字段的 label 宽度改成 200',
          pageId: 'page-1',
          version: 3,
          selectedId: 'root',
          sessionId: 'session-intent-invalid',
          confirmedIntentId: confirmedOption!.intentId,
          responseMode: 'patch',
        },
        'request-intent-invalid-2',
      ),
    ).rejects.toBeInstanceOf(AgentToolException);
    expect(aiService.runToolCalling).not.toHaveBeenCalled();
  });

  it('returns scope confirmation for batch edits within the selected container', async () => {
    const { runner, aiService, scopeConfirmationService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const result = await runner.runEdit(
      {
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-batch-1',
        responseMode: 'patch',
      },
      'request-batch-scope',
    );

    expect(result.mode).toBe('scope_confirmation');
    if (result.mode !== 'scope_confirmation') {
      throw new Error('expected scope confirmation response');
    }
    expect(result.scope).toEqual({
      rootId: 'form',
      matchedType: 'FormItem',
      matchedDisplayName: '表单项',
      targetIds: ['form-item-a', 'form-item-b'],
      targetCount: 2,
    });
    expect(
      scopeConfirmationService.get('session-batch-1', result.scopeConfirmationId),
    ).toBeDefined();
    expect(aiService.runToolCalling).not.toHaveBeenCalled();
  });

  it('generates batch patch previews only after scope confirmation', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });
    aiService.runToolCalling.mockImplementationOnce(async (input) => {
        await input.executeTool('update_components_props', {
          componentIds: ['form-item-a', 'form-item-b'],
          props: { labelWidth: 200 },
        });
        return {
          text: 'patch planned',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          warnings: [],
          steps: [
            {
              stepNumber: 0,
              finishReason: 'stop',
              toolCalls: [{ toolName: 'update_components_props' }],
            },
          ],
          toolCallCount: 1,
        };
      });

    const scopeResult = await runner.runEdit(
      {
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-batch-2',
        responseMode: 'patch',
      },
      'request-batch-confirm-1',
    );

    if (scopeResult.mode !== 'scope_confirmation') {
      throw new Error('expected scope confirmation response');
    }

    const result = await runner.runEdit(
      {
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-batch-2',
        confirmedScopeId: scopeResult.scopeConfirmationId,
        responseMode: 'patch',
      },
      'request-batch-confirm-2',
    );

    expect(result.mode).toBe('patch');
    if (result.mode !== 'patch') {
      throw new Error('expected patch response');
    }
    expect(result.patch).toEqual([
      { op: 'updateProps', componentId: 'form-item-a', props: { labelWidth: 200 } },
      { op: 'updateProps', componentId: 'form-item-b', props: { labelWidth: 200 } },
    ]);
    expect(result.scopeSummary).toEqual({
      rootId: 'form',
      matchedType: 'FormItem',
      matchedDisplayName: '表单项',
      targetCount: 2,
      changedTargetCount: 2,
    });
  });

  it('invalidates scope confirmation when the selected container changes', async () => {
    const { runner, aiService, toolExecutionService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });

    const scopeResult = await runner.runEdit(
      {
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'session-batch-3',
        responseMode: 'patch',
      },
      'request-batch-invalid-1',
    );

    if (scopeResult.mode !== 'scope_confirmation') {
      throw new Error('expected scope confirmation response');
    }

    toolExecutionService.getFocusContext.mockResolvedValueOnce(createRootFocusedResult());

    await expect(
      runner.runEdit(
        {
          instruction: '将当前表单下所有表单项 label 宽度设置为 200',
          pageId: 'page-1',
          version: 3,
          selectedId: 'root',
          sessionId: 'session-batch-3',
          confirmedScopeId: scopeResult.scopeConfirmationId,
          responseMode: 'patch',
        },
        'request-batch-invalid-2',
      ),
    ).rejects.toBeInstanceOf(AgentToolException);
    expect(aiService.runToolCalling).not.toHaveBeenCalled();
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
          instruction: '调整通过按钮文本为 pass',
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

  it('runs the Phase 6.4 fixed samples and produces a reusable evaluation report', async () => {
    const sharedTraceService = new AgentTraceService();
    const metricsService = new AgentMetricsService(sharedTraceService);

    type SampleStep = {
      response?: Awaited<ReturnType<AgentService['edit']>>;
      error?: unknown;
      trace: NonNullable<ReturnType<AgentTraceService['getTrace']>>;
    };

    const runStep = async (
      harness: ReturnType<typeof createAgentServiceHarness>,
      requestId: string,
      dto: Parameters<AgentService['edit']>[0],
    ): Promise<SampleStep> => {
      try {
        const response = await harness.agentService.edit(dto, requestId);
        const trace = sharedTraceService.getTrace(response.traceId);
        if (!trace) {
          throw new Error(`trace ${response.traceId} was not recorded`);
        }
        return { response, trace };
      } catch (error) {
        const traceId =
          error instanceof AgentToolException
            ? ((error.getResponse() as { traceId?: string }).traceId ?? `agent-${requestId}`)
            : `agent-${requestId}`;
        const trace = sharedTraceService.getTrace(traceId);
        if (!trace) {
          throw new Error(`trace ${traceId} was not recorded`);
        }
        return { error, trace };
      }
    };

    const buildScenarioReport = (name: string, steps: SampleStep[]) => {
      const traces = steps.map((step) => step.trace);
      const lastTrace = traces[traces.length - 1];
      const stageSequence = traces.flatMap((trace) => trace.statusEvents.map((event) => event.stage));
      const toolCallCount = traces.reduce((sum, trace) => sum + trace.toolCalls.length, 0);
      const durationMs = traces.reduce(
        (sum, trace) => sum + ((trace.finishedAt ?? trace.startedAt) - trace.startedAt),
        0,
      );
      const versionConflictCount = traces.reduce(
        (sum, trace) => sum + trace.versionConflictCount,
        0,
      );
      const finalMode = lastTrace.error ? 'error' : (lastTrace.result?.mode ?? 'unknown');
      const outcome = lastTrace.error
        ? 'failure'
        : lastTrace.result &&
            ['clarification', 'intent_confirmation', 'scope_confirmation'].includes(
              lastTrace.result.mode,
            )
          ? 'confirmation_blocked'
          : 'success';

      return {
        name,
        traceIds: traces.map((trace) => trace.traceId),
        finalMode,
        stageSequence,
        intentConfirmationTriggered: stageSequence.includes('awaiting_intent_confirmation'),
        scopeConfirmationTriggered: stageSequence.includes('awaiting_scope_confirmation'),
        toolCallCount,
        durationMs,
        versionConflictCount,
        outcome,
      };
    };

    const reports: Array<ReturnType<typeof buildScenarioReport>> = [];

    {
      const harness = createAgentServiceHarness({ traceService: sharedTraceService });
      const step = await runStep(harness, 'eval-simple-text', {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.response?.mode).toBe('patch');
      reports.push(buildScenarioReport('simple_text_update', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createBatchContext(),
        focusContextResult: createFormFocusedResult(),
        traceService: sharedTraceService,
      });
      const step = await runStep(harness, 'eval-explicit-scope', {
        instruction: '把当前表单下所有表单项的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-explicit-scope',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.response?.mode).toBe('scope_confirmation');
      reports.push(buildScenarioReport('explicit_scope_confirmation', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createBatchContext(),
        focusContextResult: createFormFocusedResult(),
        traceService: sharedTraceService,
      });
      const step = await runStep(harness, 'eval-ambiguous-field', {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-ambiguous-field',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.response?.mode).toBe('intent_confirmation');
      reports.push(buildScenarioReport('ambiguous_field_intent_confirmation', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createBatchContext(),
        focusContextResult: createFormFocusedResult(),
        traceService: sharedTraceService,
      });
      const intentStep = await runStep(harness, 'eval-intent-scope-1', {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-intent-scope',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(intentStep.response?.mode).toBe('intent_confirmation');
      if (intentStep.response?.mode !== 'intent_confirmation') {
        throw new Error('expected intent confirmation response');
      }

      const confirmedOption = intentStep.response.options.find((option) => option.label === '表单项');
      expect(confirmedOption).toBeDefined();

      const scopeStep = await runStep(harness, 'eval-intent-scope-2', {
        instruction: '把所有字段的 label 宽度改成 200',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-intent-scope',
        confirmedIntentId: confirmedOption!.intentId,
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(scopeStep.response?.mode).toBe('scope_confirmation');
      reports.push(buildScenarioReport('intent_then_scope_confirmation', [intentStep, scopeStep]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createBatchContext(),
        focusContextResult: createFormFocusedResult(),
        traceService: sharedTraceService,
      });
      harness.aiService.runToolCalling.mockImplementationOnce(async (input) => {
        await input.executeTool('resolve_collection_scope', {
          rootId: 'form',
          instruction: '把所有按钮都隐藏',
        });
        return {
          text: 'scope planned',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          warnings: [],
          steps: [
            {
              stepNumber: 0,
              finishReason: 'stop',
              toolCalls: [{ toolName: 'resolve_collection_scope' }],
            },
          ],
          toolCallCount: 1,
        };
      });

      const step = await runStep(harness, 'eval-no-match', {
        instruction: '把所有按钮都隐藏',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-no-match',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.error).toBeInstanceOf(AgentToolException);
      reports.push(buildScenarioReport('no_match_collection_failure', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        traceService: sharedTraceService,
      });
      harness.toolExecutionService.createExecutionContext
        .mockReset()
        .mockRejectedValueOnce(
          new AgentToolException({
            code: 'PAGE_VERSION_CONFLICT',
            message: 'Page version mismatch',
            traceId: 'agent-eval-version-conflict',
          }),
        )
        .mockImplementation(async (_input, traceId) => ({ ...createBaseContext(), traceId }));

      const step = await runStep(harness, 'eval-version-conflict', {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.response?.mode).toBe('patch');
      reports.push(buildScenarioReport('version_conflict_retry', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        traceService: sharedTraceService,
      });
      harness.toolExecutionService.executeTool.mockImplementation(async (name) => {
        if (name === 'update_component_props') {
          throw new AgentToolException({
            code: 'SCHEMA_INVALID',
            message: 'Schema contains orphaned components after patch application',
            traceId: 'agent-eval-tool-failure',
            details: { orphanIds: ['ticketDetail', 'ticketLogs'] },
          });
        }

        return { data: {} };
      });
      harness.aiService.runToolCalling.mockImplementationOnce(async (input) => {
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

      const step = await runStep(harness, 'eval-tool-failure', {
        instruction: '调整通过按钮文本为 pass',
        pageId: 'page-1',
        version: 3,
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.error).toBeInstanceOf(AgentToolException);
      reports.push(buildScenarioReport('tool_failure', [step]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createBatchContext(),
        focusContextResult: createFormFocusedResult(),
        traceService: sharedTraceService,
      });

      const scopeStep = await runStep(harness, 'eval-guard-scope', {
        instruction: '把当前表单下所有表单项都隐藏',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-guard',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(scopeStep.response?.mode).toBe('scope_confirmation');
      if (scopeStep.response?.mode !== 'scope_confirmation') {
        throw new Error('expected scope confirmation response');
      }

      harness.aiService.runToolCalling.mockImplementationOnce(async (input) => {
        await input.executeTool('update_components_props', {
          componentIds: ['form-item-a', 'form-item-b'],
          props: { visible: true },
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
              toolCalls: [{ toolName: 'update_components_props' }],
            },
          ],
          toolCallCount: 1,
        };
      });

      const guardStep = await runStep(harness, 'eval-guard-patch', {
        instruction: '把当前表单下所有表单项都隐藏',
        pageId: 'page-1',
        version: 3,
        selectedId: 'form',
        sessionId: 'eval-session-guard',
        confirmedScopeId: scopeStep.response.scopeConfirmationId,
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(guardStep.error).toBeInstanceOf(AgentToolException);
      reports.push(buildScenarioReport('guard_blocked_visibility_conflict', [scopeStep, guardStep]));
    }

    {
      const harness = createAgentServiceHarness({
        traceService: sharedTraceService,
      });
      const request = {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        provider: 'openai',
        responseMode: 'patch' as const,
        requestIdempotencyKey: 'eval-idempotent-key',
      };

      const firstStep = await runStep(harness, 'eval-idempotent-1', request);
      const secondStep = await runStep(harness, 'eval-idempotent-2', request);

      expect(firstStep.response?.mode).toBe('patch');
      expect(secondStep.response?.mode).toBe('patch');
      reports.push(buildScenarioReport('repeated_idempotent_request', [firstStep, secondStep]));
    }

    {
      const harness = createAgentServiceHarness({
        baseContext: createMixedCollectionContext(),
        focusContextResult: createMixedRootFocusedResult(),
        traceService: sharedTraceService,
      });
      const step = await runStep(harness, 'eval-mixed-hide', {
        instruction: '把所有按钮和字段都隐藏',
        pageId: 'page-1',
        version: 3,
        selectedId: 'root',
        sessionId: 'eval-session-mixed-hide',
        provider: 'openai',
        responseMode: 'patch',
      });
      expect(step.response?.mode).toBe('intent_confirmation');
      reports.push(buildScenarioReport('mixed_buttons_and_fields_hide', [step]));
    }

    const evaluationSummary = {
      totalSamples: reports.length,
      successCount: reports.filter((report) => report.outcome === 'success').length,
      failureCount: reports.filter((report) => report.outcome === 'failure').length,
      confirmationBlockedCount: reports.filter(
        (report) => report.outcome === 'confirmation_blocked',
      ).length,
      averageDurationMs: Math.round(
        reports.reduce((sum, report) => sum + report.durationMs, 0) / reports.length,
      ),
      averageToolCallCount: Number(
        (
          reports.reduce((sum, report) => sum + report.toolCallCount, 0) / reports.length
        ).toFixed(2),
      ),
      successRate: Number(
        (
          reports.filter((report) => report.outcome === 'success').length / reports.length
        ).toFixed(2),
      ),
    };

    expect(reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'simple_text_update',
          finalMode: 'patch',
          outcome: 'success',
        }),
        expect.objectContaining({
          name: 'explicit_scope_confirmation',
          finalMode: 'scope_confirmation',
          scopeConfirmationTriggered: true,
          outcome: 'confirmation_blocked',
        }),
        expect.objectContaining({
          name: 'ambiguous_field_intent_confirmation',
          finalMode: 'intent_confirmation',
          intentConfirmationTriggered: true,
          outcome: 'confirmation_blocked',
        }),
        expect.objectContaining({
          name: 'intent_then_scope_confirmation',
          finalMode: 'scope_confirmation',
          intentConfirmationTriggered: true,
          scopeConfirmationTriggered: true,
          outcome: 'confirmation_blocked',
        }),
        expect.objectContaining({
          name: 'no_match_collection_failure',
          finalMode: 'error',
          outcome: 'failure',
        }),
        expect.objectContaining({
          name: 'version_conflict_retry',
          finalMode: 'patch',
          versionConflictCount: 1,
          outcome: 'success',
        }),
        expect.objectContaining({
          name: 'tool_failure',
          finalMode: 'error',
          outcome: 'failure',
        }),
        expect.objectContaining({
          name: 'guard_blocked_visibility_conflict',
          finalMode: 'error',
          scopeConfirmationTriggered: true,
          outcome: 'failure',
        }),
        expect.objectContaining({
          name: 'repeated_idempotent_request',
          finalMode: 'patch',
          outcome: 'success',
        }),
        expect.objectContaining({
          name: 'mixed_buttons_and_fields_hide',
          finalMode: 'intent_confirmation',
          intentConfirmationTriggered: true,
          outcome: 'confirmation_blocked',
        }),
      ]),
    );
    expect(
      reports.find((report) => report.name === 'repeated_idempotent_request')?.stageSequence,
    ).toContain('cache_hit');
    expect(evaluationSummary).toEqual({
      totalSamples: 10,
      successCount: 3,
      failureCount: 3,
      confirmationBlockedCount: 4,
      averageDurationMs: expect.any(Number),
      averageToolCallCount: expect.any(Number),
      successRate: 0.3,
    });
    expect(metricsService.getSummary()).toEqual(
      expect.objectContaining({
        totalCount: 13,
        successCount: 4,
        failureCount: 3,
        confirmationBlockedCount: 6,
        versionConflictCount: 1,
      }),
    );
  });
});
