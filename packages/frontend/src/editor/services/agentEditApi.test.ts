import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentEditApi } from './agentEditApi';

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
});
