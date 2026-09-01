import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageSchemaApi } from './pageSchemaApi';

const { fetchAppMock } = vi.hoisted(() => ({
  fetchAppMock: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../lib/httpClient', () => ({
  fetchApp: fetchAppMock,
}));

describe('pageSchemaApi runtime compatibility boundary', () => {
  beforeEach(() => {
    fetchAppMock.get.mockReset();
    fetchAppMock.put.mockReset();
  });

  it('rejects a historical snapshot when its runtime profile is unavailable', async () => {
    fetchAppMock.get.mockResolvedValue({
      data: {
        pageId: 'legacy-page',
        pageVersion: 1,
        snapshotId: 'legacy-snapshot',
        savedAt: '2026-08-01T00:00:00.000Z',
        runtimeCompatibility: {
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '0.0.0-draft',
          rendererVersion: '0.0.0-draft',
        },
        schema: {
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
        },
      },
    });

    await expect(pageSchemaApi.getPageSchema('legacy-page')).rejects.toThrow(
      /unsupported runtimeCompatibility/i,
    );
  });

  it('returns a page only when the complete runtime profile matches', async () => {
    const page = {
      pageId: 'current-page',
      pageVersion: 2,
      snapshotId: 'current-snapshot',
      savedAt: '2026-09-01T00:00:00.000Z',
      runtimeCompatibility: {
        componentPresetId: 'builtin-antd',
        componentPresetVersion: '0.1.0',
        rendererVersion: '1.0.0',
      },
      schema: {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
      },
    };
    fetchAppMock.get.mockResolvedValue({ data: page });

    await expect(pageSchemaApi.getPageSchema('current-page')).resolves.toEqual(page);
  });
});
