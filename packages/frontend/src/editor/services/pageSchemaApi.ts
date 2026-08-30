import type { A2UISchema } from '../../types';
import { type ApiEnvelope, unwrapApiEnvelope } from '../lib/apiResponse';
import { fetchApp } from '../lib/httpClient';

export interface PageSchemaResponse {
  pageId: string;
  pageVersion: number;
  snapshotId: string;
  savedAt: string;
  schema: A2UISchema;
}

export interface SavePageSchemaResponse {
  pageId: string;
  pageVersion: number;
  snapshotId: string;
  savedAt: string;
}

export const pageSchemaApi = {
  async getPageSchema(pageId: string, pageVersion?: number): Promise<PageSchemaResponse> {
    const suffix = pageVersion ? `?pageVersion=${pageVersion}` : '';
    const response = await fetchApp.get<PageSchemaResponse | ApiEnvelope<PageSchemaResponse>>(
      `/api/v1/pages/${pageId}/schema${suffix}`,
    );
    return unwrapApiEnvelope(response);
  },

  async savePageSchema(
    pageId: string,
    schema: A2UISchema,
    basePageVersion?: number,
  ): Promise<SavePageSchemaResponse> {
    const response = await fetchApp.put<
      SavePageSchemaResponse | ApiEnvelope<SavePageSchemaResponse>
    >(`/api/v1/pages/${pageId}/schema`, {
      schema,
      basePageVersion,
    });
    return unwrapApiEnvelope(response);
  },
};
