import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A2UISchema, AISession } from '../../../../types';
import { useEditorStore } from '../../../store/editor-store';
import { useAIAssistantChat } from './useAIAssistantChat';

const { messageMock, modalMock, serverAIServiceMock, sessionManagerMock } = vi.hoisted(() => ({
  messageMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  modalMock: {
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    confirm: vi.fn(),
  },
  serverAIServiceMock: {
    generateResponse: vi.fn(),
    streamResponse: vi.fn(),
  },
  sessionManagerMock: {
    currentSession: null as AISession | null,
    createNewSession: vi.fn(),
    updateCurrentSessionMessages: vi.fn(),
  },
}));

vi.mock('antd', () => ({
  message: messageMock,
  Modal: modalMock,
}));

vi.mock('../api/ServerAIService', () => ({
  serverAIService: serverAIServiceMock,
}));

vi.mock('../../../hooks', () => ({
  useSessionManager: () => sessionManagerMock,
}));

describe('useAIAssistantChat', () => {
  const baseSchema: A2UISchema = {
    version: 3,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['button'],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: '旧文案' },
      },
    },
  };

  const createdSession: AISession = {
    id: 'session-1',
    title: 'AI 修改',
    createdAt: 1,
    updatedAt: 1,
    messageCount: 0,
    lastMessageContent: '',
    lastMessageTimestamp: 0,
    messages: [],
  };

  beforeEach(() => {
    vi.useRealTimers();
    messageMock.success.mockReset();
    messageMock.error.mockReset();
    messageMock.warning.mockReset();
    messageMock.info.mockReset();
    modalMock.warning.mockReset();
    modalMock.info.mockReset();
    modalMock.error.mockReset();
    modalMock.success.mockReset();
    modalMock.confirm.mockReset();
    serverAIServiceMock.generateResponse.mockReset();
    serverAIServiceMock.streamResponse.mockReset();
    sessionManagerMock.currentSession = null;
    sessionManagerMock.createNewSession.mockReset();
    sessionManagerMock.updateCurrentSessionMessages.mockReset();
    sessionManagerMock.createNewSession.mockResolvedValue(createdSession);
    useEditorStore.setState({
      currentSessionId: null,
      sessions: [],
      aiScopeRootId: null,
      aiScopeTargetIds: [],
      aiScopeSourceMessageId: null,
      isHistoryDrawerOpen: false,
      isFloatingIslandOpen: false,
      isLoading: false,
      error: null,
    });
  });

  it('uses streamed auto mode and keeps patch results in preview state until confirmed', async () => {
    const nextSchema: A2UISchema = {
      ...baseSchema,
      components: {
        ...baseSchema.components,
        button: {
          ...baseSchema.components.button,
          props: { children: '提交' },
        },
      },
    };

    serverAIServiceMock.streamResponse.mockImplementation(async (_request: any, handlers: any) => {
      await handlers.onEvent({ type: 'meta', traceId: 'agent-trace' });
      await handlers.onEvent({
        type: 'route',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'patch',
          reason: 'selected_target',
          manualOverride: false,
        },
      });
      await handlers.onEvent({
        type: 'status',
        stage: 'calling_tool',
        label: '正在执行工具 update_component_props',
        toolName: 'update_component_props',
      });
      await handlers.onEvent({
        type: 'result',
        result: {
          mode: 'patch',
          patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
          previewSchema: nextSchema,
          previewSummary: '本次修改共 1 个 patch，涉及 文案1处。',
          changeGroups: [
            {
              kind: 'content',
              label: '文案',
              count: 1,
              entries: [
                {
                  op: 'updateProps',
                  targetId: 'button',
                  summary: '更新文案 button -> 提交',
                },
              ],
            },
          ],
          risk: {
            level: 'low',
            reasons: ['局部低范围修改'],
            patchOps: 1,
            distinctTargets: 1,
            requiresConfirmation: false,
          },
          requiresConfirmation: false,
          warnings: ['auto-fixed'],
          resolvedSelectedId: 'button',
          traceId: 'agent-trace',
          route: {
            requestedMode: 'auto',
            resolvedMode: 'patch',
            reason: 'selected_target',
            manualOverride: false,
          },
        },
      });
      await handlers.onEvent({ type: 'done', success: true });
      return { terminal: 'result' };
    });

    const onPatchApply = vi.fn().mockResolvedValue(nextSchema);
    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        selectedId: 'button',
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
        onPatchApply,
      }),
    );

    await act(async () => {
      result.current.setInputValue('把这个按钮改成提交');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(serverAIServiceMock.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        draftSchema: baseSchema,
        sessionId: 'session-1',
        requestIdempotencyKey: expect.stringContaining('session-1:'),
        responseMode: 'auto',
      }),
      expect.any(Object),
    );
    expect(onPatchApply).not.toHaveBeenCalled();

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('success');
    expect(aiMessage.route?.resolvedMode).toBe('patch');
    expect(aiMessage.progress?.stage).toBe('completed');
    expect(aiMessage.patchPreview?.previewSchema).toEqual(nextSchema);
    expect(aiMessage.applyState).toBe('pending');

    await act(async () => {
      await result.current.applyPatchPreview(aiMessage.id);
    });

    expect(onPatchApply).toHaveBeenCalledWith({
      instruction: '把这个按钮改成提交',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      resolvedSelectedId: 'button',
      warnings: ['auto-fixed'],
      traceId: 'agent-trace',
    });
    expect(result.current.messages[result.current.messages.length - 1].applyState).toBe('applied');

    const sessionMessages = sessionManagerMock.updateCurrentSessionMessages.mock.calls[1][0];
    expect(sessionMessages[sessionMessages.length - 1].actionResult).toBeUndefined();

    const persistedSessionMessages =
      sessionManagerMock.updateCurrentSessionMessages.mock.calls[
        sessionManagerMock.updateCurrentSessionMessages.mock.calls.length - 1
      ][0];
    const assistantMessage = persistedSessionMessages[persistedSessionMessages.length - 1];
    expect(assistantMessage.actionResult).toMatchObject({
      type: 'batch_update',
      componentId: 'button',
      schemaSnapshot: nextSchema,
    });
  });

  it('falls back to schema mode when patch editing is unavailable', async () => {
    serverAIServiceMock.streamResponse.mockRejectedValue(new Error('stream unavailable'));
    serverAIServiceMock.generateResponse.mockResolvedValue({
      mode: 'schema',
      content: '{"rootId":"root"}',
      schema: baseSchema,
      traceId: 'agent-schema',
      route: {
        requestedMode: 'schema',
        resolvedMode: 'schema',
        reason: 'manual_schema',
        manualOverride: true,
      },
    });

    const onPatchApply = vi.fn();
    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: null,
        selectedId: 'button',
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
        onPatchApply,
      }),
    );

    await act(async () => {
      result.current.setInputValue('生成页面');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(serverAIServiceMock.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: 'auto',
        sessionId: 'session-1',
      }),
      expect.any(Object),
    );
    expect(serverAIServiceMock.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: 'auto',
      }),
    );
    expect(onPatchApply).not.toHaveBeenCalled();

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('success');
    expect(aiMessage.schema).toEqual(baseSchema);
    expect(aiMessage.route?.resolvedMode).toBe('schema');
    expect(aiMessage.content).toContain('页面结构已生成并完成校验');
  });

  it('stores clarification responses and allows choosing a candidate to continue', async () => {
    serverAIServiceMock.streamResponse
      .mockImplementationOnce(async (_request: any, handlers: any) => {
        await handlers.onEvent({ type: 'meta', traceId: 'agent-clarify' });
        await handlers.onEvent({
          type: 'route',
          route: {
            requestedMode: 'auto',
            resolvedMode: 'patch',
            reason: 'candidate_target',
            manualOverride: false,
          },
        });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'clarification',
            content: '我找到了多个可能的目标组件，请选择。',
            question: '请选择要继续编辑的目标组件',
            clarificationId: 'agent-clarify-1',
            candidates: [
              {
                id: 'button-a',
                type: 'Button',
                score: 0.46,
                reason: '文本匹配',
                displayLabel: '提交',
                secondaryLabel: '按钮',
                pathLabel: '页面 > 主操作区',
              },
              {
                id: 'button-b',
                type: 'Button',
                score: 0.4,
                reason: '文本匹配',
                displayLabel: '保存',
                secondaryLabel: '按钮',
                pathLabel: '页面 > 次操作区',
              },
            ],
            warnings: [],
            traceId: 'agent-clarify',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'patch',
              reason: 'candidate_target',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      })
      .mockImplementationOnce(async (request: any, handlers: any) => {
        expect(request.selectedId).toBe('button-a');
        await handlers.onEvent({ type: 'meta', traceId: 'agent-follow-up' });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'answer',
            content: '已定位到 Button(button-a)。',
            warnings: [],
            traceId: 'agent-follow-up',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'answer',
              reason: 'page_question_intent',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('把那个按钮改成提交');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    const clarificationMessage = result.current.messages[result.current.messages.length - 1];
    expect(clarificationMessage.clarification?.candidates).toHaveLength(2);
    expect(clarificationMessage.clarification?.candidates[0]).toMatchObject({
      displayLabel: '提交',
      pathLabel: '页面 > 主操作区',
    });

    await act(async () => {
      await result.current.resolveClarification(
        clarificationMessage.id,
        'button-a',
        '提交（页面 > 主操作区）',
      );
    });

    const latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(latestMessage.content).toContain('已定位到 Button(button-a)');
  });

  it('stores scope confirmation highlights and confirms batch patch generation in-place', async () => {
    const batchSchema: A2UISchema = {
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

    serverAIServiceMock.streamResponse
      .mockImplementationOnce(async (_request: any, handlers: any) => {
        await handlers.onEvent({ type: 'meta', traceId: 'agent-scope' });
        await handlers.onEvent({
          type: 'route',
          route: {
            requestedMode: 'auto',
            resolvedMode: 'patch',
            reason: 'selected_target',
            manualOverride: false,
          },
        });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'scope_confirmation',
            content: '已识别到当前容器下 2 个表单项，请先确认范围。',
            question: '确认修改当前容器下的 2 个表单项',
            scopeConfirmationId: 'scope-1',
            scope: {
              rootId: 'form',
              matchedType: 'FormItem',
              matchedDisplayName: '表单项',
              targetIds: ['form-item-a', 'form-item-b'],
              targetCount: 2,
            },
            warnings: ['范围高亮仅用于确认，不会改变组件树选中状态'],
            traceId: 'agent-scope',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'patch',
              reason: 'selected_target',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      })
      .mockImplementationOnce(async (request: any, handlers: any) => {
        expect(request.confirmedScopeId).toBe('scope-1');
        expect(request.selectedId).toBe('form');
        await handlers.onEvent({ type: 'meta', traceId: 'agent-batch-patch' });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'patch',
            patch: [
              { op: 'updateProps', componentId: 'form-item-a', props: { labelWidth: 200 } },
              { op: 'updateProps', componentId: 'form-item-b', props: { labelWidth: 200 } },
            ],
            previewSchema: {
              ...batchSchema,
              components: {
                ...batchSchema.components,
                'form-item-a': {
                  ...batchSchema.components['form-item-a'],
                  props: { label: '用户名', labelWidth: 200 },
                },
                'form-item-b': {
                  ...batchSchema.components['form-item-b'],
                  props: { label: '密码', labelWidth: 200 },
                },
              },
            },
            previewSummary: '本次修改共 2 个 patch，涉及 2 个表单项。',
            changeGroups: [
              {
                kind: 'props',
                label: '属性',
                count: 2,
                entries: [
                  {
                    op: 'updateProps',
                    targetId: 'form-item-a',
                    summary: '更新表单项 labelWidth 为 200',
                  },
                  {
                    op: 'updateProps',
                    targetId: 'form-item-b',
                    summary: '更新表单项 labelWidth 为 200',
                  },
                ],
              },
            ],
            risk: {
              level: 'low',
              reasons: ['已限定在确认范围内'],
              patchOps: 2,
              distinctTargets: 2,
              requiresConfirmation: false,
            },
            requiresConfirmation: false,
            warnings: [],
            resolvedSelectedId: 'form',
            scopeSummary: {
              rootId: 'form',
              matchedType: 'FormItem',
              matchedDisplayName: '表单项',
              targetCount: 2,
              changedTargetCount: 2,
            },
            traceId: 'agent-batch-patch',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'patch',
              reason: 'selected_target',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: batchSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        selectedId: 'form',
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('将当前表单下所有表单项 label 宽度设置为 200');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    const scopeMessage = result.current.messages[result.current.messages.length - 1];
    expect(scopeMessage.scopeConfirmation?.scope.targetIds).toEqual(['form-item-a', 'form-item-b']);
    expect(useEditorStore.getState().aiScopeRootId).toBe('form');
    expect(useEditorStore.getState().aiScopeTargetIds).toEqual(['form-item-a', 'form-item-b']);

    await act(async () => {
      result.current.clearScopeHighlight();
    });

    expect(useEditorStore.getState().aiScopeRootId).toBeNull();
    expect(result.current.messages).toHaveLength(3);

    await act(async () => {
      result.current.restoreScopeHighlight(scopeMessage.id);
    });

    expect(useEditorStore.getState().aiScopeRootId).toBe('form');
    expect(useEditorStore.getState().aiScopeTargetIds).toEqual(['form-item-a', 'form-item-b']);

    await act(async () => {
      await result.current.confirmScope(scopeMessage.id);
    });

    const latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(result.current.messages).toHaveLength(3);
    expect(latestMessage.patchPreview?.scopeSummary).toEqual({
      rootId: 'form',
      matchedType: 'FormItem',
      matchedDisplayName: '表单项',
      targetCount: 2,
      changedTargetCount: 2,
    });
    expect(latestMessage.scopeConfirmation).toBeUndefined();
    expect(useEditorStore.getState().aiScopeRootId).toBeNull();
  });

  it('confirms ambiguous intent in-place before entering scope confirmation', async () => {
    const batchSchema: A2UISchema = {
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

    serverAIServiceMock.streamResponse
      .mockImplementationOnce(async (_request: any, handlers: any) => {
        await handlers.onEvent({ type: 'meta', traceId: 'agent-intent' });
        await handlers.onEvent({
          type: 'status',
          stage: 'awaiting_intent_confirmation',
          label: '已识别到多种可能语义，等待确认',
          detail: '表单项 / 输入框',
        });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'intent_confirmation',
            content: '请先确认你说的是哪一类组件。',
            question: '请先确认你说的是哪一类组件',
            intentConfirmationId: 'intent-confirm-1',
            options: [
              {
                intentId: 'intent-1',
                label: '表单项',
                description: '统一修改表单项容器。',
              },
              {
                intentId: 'intent-2',
                label: '输入框',
                description: '统一修改输入控件本身。',
              },
            ],
            warnings: [],
            traceId: 'agent-intent',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'patch',
              reason: 'selected_target',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      })
      .mockImplementationOnce(async (request: any, handlers: any) => {
        expect(request.confirmedIntentId).toBe('intent-1');
        expect(request.selectedId).toBe('form');
        await handlers.onEvent({ type: 'meta', traceId: 'agent-intent-confirmed' });
        await handlers.onEvent({
          type: 'status',
          stage: 'planning_scope',
          label: '正在根据已确认语义解析批量范围',
          toolName: 'resolve_collection_scope',
        });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'scope_confirmation',
            content: '已识别到当前容器下 2 个表单项，请先确认范围。',
            question: '确认修改当前容器下的 2 个表单项',
            scopeConfirmationId: 'scope-intent-1',
            scope: {
              rootId: 'form',
              matchedType: 'FormItem',
              matchedDisplayName: '表单项',
              targetIds: ['form-item-a', 'form-item-b'],
              targetCount: 2,
            },
            warnings: [],
            traceId: 'agent-intent-confirmed',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'patch',
              reason: 'selected_target',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: batchSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        selectedId: 'form',
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('把所有字段的 label 宽度改成 200');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    const intentMessage = result.current.messages[result.current.messages.length - 1];
    expect(intentMessage.intentConfirmation?.options.map((option) => option.label)).toEqual([
      '表单项',
      '输入框',
    ]);
    expect(intentMessage.traceSummary?.stages.map((stage) => stage.label)).toContain(
      '已识别到多种可能语义，等待确认',
    );
    expect(useEditorStore.getState().aiScopeRootId).toBeNull();
    expect(useEditorStore.getState().aiScopeTargetIds).toEqual([]);

    await act(async () => {
      await result.current.confirmIntent(intentMessage.id, 'intent-1');
    });

    const confirmedMessage = result.current.messages[result.current.messages.length - 1];
    expect(result.current.messages).toHaveLength(3);
    expect(confirmedMessage.intentConfirmation).toBeUndefined();
    expect(confirmedMessage.scopeConfirmation?.scope.matchedDisplayName).toBe('表单项');
    expect(confirmedMessage.traceSummary?.toolCalls.map((tool) => tool.toolName)).toContain(
      'resolve_collection_scope',
    );
    expect(useEditorStore.getState().aiScopeRootId).toBe('form');
    expect(useEditorStore.getState().aiScopeTargetIds).toEqual(['form-item-a', 'form-item-b']);
  });

  it('reveals streamed answer content incrementally before the final result arrives', async () => {
    vi.useFakeTimers();
    let releaseResult: (() => void) | undefined;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });

    serverAIServiceMock.streamResponse.mockImplementation(async (_request: any, handlers: any) => {
      await handlers.onEvent({ type: 'meta', traceId: 'agent-answer-stream' });
      await handlers.onEvent({
        type: 'route',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'answer',
          reason: 'general_question_intent',
          manualOverride: false,
        },
      });
      await handlers.onEvent({
        type: 'content_delta',
        mode: 'answer',
        delta: '这是一个',
      });
      await handlers.onEvent({
        type: 'content_delta',
        mode: 'answer',
        delta: '流式回答。',
      });

      await vi.advanceTimersByTimeAsync(80);
      await resultGate;

      await handlers.onEvent({
        type: 'result',
        result: {
          mode: 'answer',
          content: '这是一个流式回答。',
          warnings: [],
          traceId: 'agent-answer-stream',
          route: {
            requestedMode: 'auto',
            resolvedMode: 'answer',
            reason: 'general_question_intent',
            manualOverride: false,
          },
        },
      });
      await handlers.onEvent({ type: 'done', success: true });
      return { terminal: 'result' };
    });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('介绍一下这个页面');
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage();
      await vi.advanceTimersByTimeAsync(80);
    });

    let latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(latestMessage.content.length).toBeGreaterThan(0);
    expect(latestMessage.status).toBe('loading');

    await act(async () => {
      releaseResult?.();
      await sendPromise;
    });

    latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(latestMessage.content).toContain('这是一个流式回答。');
    expect(latestMessage.status).toBe('success');

    vi.useRealTimers();
  });

  it('shows schema progress states and a final summary instead of streaming raw schema text', async () => {
    vi.useFakeTimers();
    let releaseResult: (() => void) | undefined;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });

    serverAIServiceMock.streamResponse.mockImplementation(async (_request: any, handlers: any) => {
      await handlers.onEvent({ type: 'meta', traceId: 'agent-schema-stream' });
      await handlers.onEvent({
        type: 'route',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'schema',
          reason: 'whole_page_generation_intent',
          manualOverride: false,
        },
      });
      await handlers.onEvent({
        type: 'status',
        stage: 'calling_model',
        label: '正在准备生成：登录页',
      });

      await vi.advanceTimersByTimeAsync(120);
      await resultGate;

      await handlers.onEvent({
        type: 'status',
        stage: 'validating_output',
        label: '正在校验 Schema 结果',
      });
      await handlers.onEvent({
        type: 'result',
        result: {
          mode: 'schema',
          content: '{"rootId":"root","components":{"root":{"id":"root","type":"Page"}}}',
          schema: baseSchema,
          warnings: [],
          traceId: 'agent-schema-stream',
          route: {
            requestedMode: 'auto',
            resolvedMode: 'schema',
            reason: 'whole_page_generation_intent',
            manualOverride: false,
          },
        },
      });
      await handlers.onEvent({ type: 'done', success: true });
      return { terminal: 'result' };
    });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('生成一个登录页');
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage();
      await vi.advanceTimersByTimeAsync(120);
    });

    let latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(latestMessage.content).toBe('');
    expect(latestMessage.status).toBe('loading');
    expect(latestMessage.schema).toBeUndefined();
    expect(latestMessage.progress?.label).toBe('正在准备生成：登录页');

    await act(async () => {
      releaseResult?.();
      await sendPromise;
    });

    latestMessage = result.current.messages[result.current.messages.length - 1];
    expect(latestMessage.content).toContain('页面结构已生成并完成校验');
    expect(latestMessage.content).toContain('包含 2 个组件');
    expect(latestMessage.schema).toEqual(baseSchema);
    expect(latestMessage.progress?.stage).toBe('completed');

    vi.useRealTimers();
  });

  it('shows version conflict feedback and does not fall back after a structured stream error', async () => {
    serverAIServiceMock.streamResponse.mockImplementation(async (_request: any, handlers: any) => {
      await handlers.onEvent({ type: 'meta', traceId: 'agent-conflict' });
      await handlers.onEvent({
        type: 'error',
        error: {
          code: 'PAGE_VERSION_CONFLICT',
          message: 'Page version mismatch',
          traceId: 'agent-conflict',
        },
      });
      await handlers.onEvent({ type: 'done', success: false });
      return { terminal: 'error' };
    });

    const onPatchApply = vi.fn();
    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        selectedId: 'button',
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
        onPatchApply,
      }),
    );

    await act(async () => {
      result.current.setInputValue('把这个按钮改成提交');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(onPatchApply).not.toHaveBeenCalled();
    expect(serverAIServiceMock.generateResponse).not.toHaveBeenCalled();
    expect(modalMock.warning).toHaveBeenCalledTimes(1);

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('error');
    expect(aiMessage.content).toContain('页面版本已变化');
  });

  it('truncates oversized conversation history entries before sending requests', async () => {
    const longAnswer = 'A'.repeat(4500);

    serverAIServiceMock.streamResponse
      .mockImplementationOnce(async (_request: any, handlers: any) => {
        await handlers.onEvent({ type: 'meta', traceId: 'agent-long-1' });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'answer',
            content: longAnswer,
            warnings: [],
            traceId: 'agent-long-1',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'answer',
              reason: 'general_question_intent',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      })
      .mockImplementationOnce(async (request: any, handlers: any) => {
        const historyEntry = request.conversationHistory.find(
          (item: { role: string; content: string }) => item.role === 'assistant',
        );
        expect(historyEntry.content.length).toBeLessThanOrEqual(4000);
        expect(historyEntry.content.endsWith('...(truncated)')).toBe(true);

        await handlers.onEvent({ type: 'meta', traceId: 'agent-long-2' });
        await handlers.onEvent({
          type: 'result',
          result: {
            mode: 'answer',
            content: '第二次请求成功',
            warnings: [],
            traceId: 'agent-long-2',
            route: {
              requestedMode: 'auto',
              resolvedMode: 'answer',
              reason: 'general_question_intent',
              manualOverride: false,
            },
          },
        });
        await handlers.onEvent({ type: 'done', success: true });
        return { terminal: 'result' };
      });

    const loadModels = vi.fn().mockResolvedValue(undefined);
    const ensureModelsLoaded = vi.fn().mockResolvedValue(undefined);
    const models = [
      { id: 'openai-default', name: 'OpenAI', provider: 'openai' as const, model: 'gpt-5.4' },
    ];

    const { result } = renderHook(() =>
      useAIAssistantChat({
        currentSchema: baseSchema,
        currentModel: 'openai-default',
        pageId: 'page-1',
        pageVersion: 3,
        models,
        loadModels,
        ensureModelsLoaded,
        responseMode: 'auto',
      }),
    );

    await act(async () => {
      result.current.setInputValue('第一问');
    });
    await act(async () => {
      await result.current.sendMessage();
    });

    await act(async () => {
      result.current.setInputValue('第二问');
    });
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.messages[result.current.messages.length - 1].content).toContain(
      '第二次请求成功',
    );
  });
});
