import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A2UISchema, AISession } from '../../../../types';
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
  });

  it('uses streamed auto mode and applies patch results when patch editing is available', async () => {
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
        responseMode: 'auto',
      }),
      expect.any(Object),
    );
    expect(onPatchApply).toHaveBeenCalledWith({
      instruction: '把这个按钮改成提交',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      resolvedSelectedId: 'button',
      warnings: ['auto-fixed'],
      traceId: 'agent-trace',
    });

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('success');
    expect(aiMessage.route?.resolvedMode).toBe('patch');
    expect(aiMessage.progress?.stage).toBe('completed');
    expect(aiMessage.content).toContain('已应用 1 个 patch');

    const sessionMessages = sessionManagerMock.updateCurrentSessionMessages.mock.calls[1][0];
    const assistantMessage = sessionMessages[sessionMessages.length - 1];
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
        responseMode: 'schema',
      }),
      expect.any(Object),
    );
    expect(serverAIServiceMock.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: 'schema',
      }),
    );
    expect(onPatchApply).not.toHaveBeenCalled();

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('success');
    expect(aiMessage.schema).toEqual(baseSchema);
    expect(aiMessage.route?.resolvedMode).toBe('schema');
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
});
