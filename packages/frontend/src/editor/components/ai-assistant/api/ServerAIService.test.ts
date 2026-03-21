import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serverAIService } from './ServerAIService';

const { fetchAppMock } = vi.hoisted(() => ({
  fetchAppMock: {
    post: vi.fn(),
    streamRequest: vi.fn(),
  },
}));

vi.mock('../../../lib/httpClient', () => ({
  fetchApp: fetchAppMock,
}));

describe('ServerAIService', () => {
  beforeEach(() => {
    fetchAppMock.post.mockReset();
    fetchAppMock.streamRequest.mockReset();
  });

  it('sends the unified agent edit request to /api/v1/agent/edit', async () => {
    fetchAppMock.post.mockResolvedValue({
      data: {
        mode: 'schema',
        content: '{"rootId":"root","components":{"root":{"id":"root","type":"Button"}}}',
        traceId: 'agent-trace',
        route: {
          requestedMode: 'schema',
          resolvedMode: 'schema',
          reason: 'manual_schema',
          manualOverride: true,
        },
      },
    });

    await serverAIService.generateResponse({
      instruction: '把按钮改成提交',
      modelId: 'openai-default',
      pageId: 'page-1',
      version: 3,
      selectedId: 'btn-submit',
      draftSchema: {
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Button',
          },
        },
      },
      conversationHistory: [{ role: 'user', content: 'hello' }],
      options: {
        temperature: 0.2,
        maxTokens: 1024,
      },
    });

    expect(fetchAppMock.post).toHaveBeenCalledWith('/api/v1/agent/edit', {
      instruction: '把按钮改成提交',
      modelId: 'openai-default',
      provider: undefined,
      pageId: 'page-1',
      version: 3,
      selectedId: 'btn-submit',
      draftSchema: {
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Button',
          },
        },
      },
      conversationHistory: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 1024,
      stream: undefined,
      responseMode: 'schema',
    });
  });

  it('parses structured agent SSE events from /api/v1/agent/edit/stream', async () => {
    const payload = [
      'event: meta',
      'data: {"type":"meta","traceId":"agent-trace"}',
      '',
      'event: route',
      'data: {"type":"route","route":{"requestedMode":"auto","resolvedMode":"patch","reason":"selected_target","manualOverride":false}}',
      '',
      'event: content_delta',
      'data: {"type":"content_delta","mode":"answer","delta":"你好"}',
      '',
      'event: result',
      'data: {"type":"result","result":{"mode":"patch","patch":[],"previewSchema":{"rootId":"root","components":{"root":{"id":"root","type":"Page"}}},"previewSummary":"本次修改共 0 个 patch。","changeGroups":[],"risk":{"level":"low","reasons":["局部低范围修改"],"patchOps":0,"distinctTargets":0,"requiresConfirmation":false},"requiresConfirmation":false,"warnings":[],"traceId":"agent-trace","route":{"requestedMode":"auto","resolvedMode":"patch","reason":"selected_target","manualOverride":false}}}',
      '',
      'event: done',
      'data: {"type":"done","success":true}',
      '',
    ].join('\n');

    fetchAppMock.streamRequest.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(payload));
          controller.close();
        },
      }),
    });

    const events: Array<{ type: string }> = [];
    const result = await serverAIService.streamResponse(
      {
        instruction: '把按钮改成提交',
        responseMode: 'auto',
      },
      {
        onEvent: async (event) => {
          events.push({ type: event.type });
        },
      },
    );

    expect(fetchAppMock.streamRequest).toHaveBeenCalledWith('/api/v1/agent/edit/stream', {
      instruction: '把按钮改成提交',
      modelId: undefined,
      provider: undefined,
      pageId: undefined,
      version: undefined,
      selectedId: undefined,
      draftSchema: undefined,
      conversationHistory: undefined,
      temperature: undefined,
      maxTokens: undefined,
      stream: true,
      responseMode: 'auto',
    });
    expect(events).toEqual([
      { type: 'meta' },
      { type: 'route' },
      { type: 'content_delta' },
      { type: 'result' },
      { type: 'done' },
    ]);
    expect(result).toEqual({ terminal: 'result' });
  });
});
