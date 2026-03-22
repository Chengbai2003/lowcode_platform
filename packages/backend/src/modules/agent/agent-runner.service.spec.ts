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
import { AgentPolicyService } from './agent-policy.service';
import { AgentScopeConfirmationService } from './agent-scope-confirmation.service';
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

describe('AgentRunnerService', () => {
  function createRunner(options?: {
    baseContext?: ToolExecutionContext;
    focusContextResult?: FocusContextResult;
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
    const scopeConfirmationService = new AgentScopeConfirmationService();

    const runner = new AgentRunnerService(
      aiService as unknown as AIService,
      toolExecutionService as unknown as ToolExecutionService,
      toolRegistry as unknown as ToolRegistryService,
      policyService,
      componentMetaRegistry,
      collectionTargetResolver,
      scopeConfirmationService,
    );

    return {
      runner,
      aiService,
      toolExecutionService,
      scopeConfirmationService,
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

  it('returns scope confirmation for batch edits within the selected container', async () => {
    const { runner, aiService, scopeConfirmationService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });
    aiService.runToolCalling.mockImplementationOnce(async (input) => {
      await input.executeTool('resolve_collection_scope', {
        rootId: 'form',
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
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
  });

  it('generates batch patch previews only after scope confirmation', async () => {
    const { runner, aiService } = createRunner({
      baseContext: createBatchContext(),
      focusContextResult: createFormFocusedResult(),
    });
    aiService.runToolCalling
      .mockImplementationOnce(async (input) => {
        await input.executeTool('resolve_collection_scope', {
          rootId: 'form',
          instruction: '将当前表单下所有表单项 label 宽度设置为 200',
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
      })
      .mockImplementationOnce(async (input) => {
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
    aiService.runToolCalling.mockImplementationOnce(async (input) => {
      await input.executeTool('resolve_collection_scope', {
        rootId: 'form',
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
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
});
