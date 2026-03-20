import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentEditApi } from './agentEditApi';
import { AIServiceError } from '../components/ai-assistant/types/ai-types';

const { fetchAppMock } = vi.hoisted(() => ({
  fetchAppMock: {
    post: vi.fn(),
  },
}));

vi.mock('../lib/httpClient', () => ({
  fetchApp: fetchAppMock,
}));

describe('agentEditApi', () => {
  beforeEach(() => {
    fetchAppMock.post.mockReset();
  });

  it('forces responseMode=patch when calling /api/v1/agent/edit', async () => {
    fetchAppMock.post.mockResolvedValue({
      data: {
        mode: 'patch',
        patch: [],
        warnings: [],
        traceId: 'agent-trace',
      },
    });

    await agentEditApi.editPatch({
      instruction: '把按钮改成提交',
      pageId: 'page-1',
      version: 4,
    });

    expect(fetchAppMock.post).toHaveBeenCalledWith('/api/v1/agent/edit', {
      instruction: '把按钮改成提交',
      pageId: 'page-1',
      version: 4,
      responseMode: 'patch',
    });
  });

  it('maps backend tool errors to AIServiceError', async () => {
    fetchAppMock.post.mockRejectedValue({
      message: 'Page version mismatch',
      status: 409,
      code: 'PAGE_VERSION_CONFLICT',
      traceId: 'agent-trace',
      details: { expectedVersion: 4, receivedVersion: 3 },
    });

    await expect(
      agentEditApi.editPatch({
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 3,
      }),
    ).rejects.toMatchObject({
      code: 'PAGE_VERSION_CONFLICT',
      message: 'Page version mismatch',
    } satisfies Partial<AIServiceError>);
  });
});
