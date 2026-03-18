import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serverAIService } from './ServerAIService';

const { fetchAppMock } = vi.hoisted(() => ({
  fetchAppMock: {
    post: vi.fn(),
  },
}));

vi.mock('../../../lib/httpClient', () => ({
  fetchApp: fetchAppMock,
}));

describe('ServerAIService', () => {
  beforeEach(() => {
    fetchAppMock.post.mockReset();
  });

  it('sends the unified agent edit request to /api/v1/agent/edit', async () => {
    fetchAppMock.post.mockResolvedValue({
      data: {
        mode: 'schema',
        content: '{"rootId":"root","components":{"root":{"id":"root","type":"Button"}}}',
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
    });
  });
});
