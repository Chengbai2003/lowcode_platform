import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { A2UISchema, AISession } from '../../../../types';
import { AIServiceError } from '../types/ai-types';
import { useAIAssistantChat } from './useAIAssistantChat';

const { messageMock, modalMock, agentEditApiMock, serverAIServiceMock, sessionManagerMock } =
  vi.hoisted(() => ({
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
    agentEditApiMock: {
      editPatch: vi.fn(),
    },
    serverAIServiceMock: {
      generateResponse: vi.fn(),
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

vi.mock('../../../services/agentEditApi', () => ({
  agentEditApi: agentEditApiMock,
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
    agentEditApiMock.editPatch.mockReset();
    serverAIServiceMock.generateResponse.mockReset();
    sessionManagerMock.currentSession = null;
    sessionManagerMock.createNewSession.mockReset();
    sessionManagerMock.updateCurrentSessionMessages.mockReset();
    sessionManagerMock.createNewSession.mockResolvedValue(createdSession);
  });

  it('uses patch mode when page context and patch apply handler are available', async () => {
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

    agentEditApiMock.editPatch.mockResolvedValue({
      mode: 'patch',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      warnings: ['auto-fixed'],
      resolvedSelectedId: 'button',
      traceId: 'agent-trace',
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
        onPatchApply,
      }),
    );

    await act(async () => {
      result.current.setInputValue('把这个按钮改成提交');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(agentEditApiMock.editPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        draftSchema: baseSchema,
      }),
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
    expect(aiMessage.schema).toBeUndefined();
    expect(aiMessage.content).toContain('已应用 1 个 patch');

    const sessionMessages = sessionManagerMock.updateCurrentSessionMessages.mock.calls[1][0];
    const assistantMessage = sessionMessages[sessionMessages.length - 1];
    expect(assistantMessage.actionResult).toMatchObject({
      type: 'batch_update',
      componentId: 'button',
      schemaSnapshot: nextSchema,
    });
  });

  it('falls back to schema mode when page version is unavailable', async () => {
    serverAIServiceMock.generateResponse.mockResolvedValue({
      mode: 'schema',
      content: '{"rootId":"root"}',
      schema: baseSchema,
      traceId: 'agent-schema',
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
        onPatchApply,
      }),
    );

    await act(async () => {
      result.current.setInputValue('生成页面');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(serverAIServiceMock.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: 'schema',
      }),
    );
    expect(agentEditApiMock.editPatch).not.toHaveBeenCalled();
    expect(onPatchApply).not.toHaveBeenCalled();

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('success');
    expect(aiMessage.schema).toEqual(baseSchema);
  });

  it('shows version conflict feedback and does not apply patch on failure', async () => {
    agentEditApiMock.editPatch.mockRejectedValue(
      new AIServiceError('Page version mismatch', 'PAGE_VERSION_CONFLICT', {
        traceId: 'agent-conflict',
      }),
    );

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
    expect(modalMock.warning).toHaveBeenCalledTimes(1);

    const aiMessage = result.current.messages[result.current.messages.length - 1];
    expect(aiMessage.status).toBe('error');
    expect(aiMessage.content).toContain('页面版本已变化');
  });
});
