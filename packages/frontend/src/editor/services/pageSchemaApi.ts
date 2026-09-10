import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { BUILTIN_RENDERER_PRESET_CATALOG } from '../../renderer-preset-catalog';
import { type ApiEnvelope, unwrapApiEnvelope } from '../lib/apiResponse';
import { fetchApp } from '../lib/httpClient';

export interface PageSchemaResponse {
  pageId: string;
  pageVersion: number;
  snapshotId: string;
  savedAt: string;
  runtimeCompatibility: RuntimeCompatibility;
  schema: PageSchema;
}

export interface SavePageSchemaResponse {
  pageId: string;
  pageVersion: number;
  snapshotId: string;
  savedAt: string;
}

function requireSupportedRuntimeCompatibility(
  runtimeCompatibility: RuntimeCompatibility | undefined,
): void {
  if (!runtimeCompatibility) {
    throw new Error('[PageSchema] Unsupported runtimeCompatibility: null');
  }
  BUILTIN_RENDERER_PRESET_CATALOG.resolve(runtimeCompatibility);
}

export const pageSchemaApi = {
  async getPageSchema(pageId: string, pageVersion?: number): Promise<PageSchemaResponse> {
    const suffix = pageVersion ? `?pageVersion=${pageVersion}` : '';
    const response = await fetchApp.get<PageSchemaResponse | ApiEnvelope<PageSchemaResponse>>(
      `/api/v1/pages/${pageId}/schema${suffix}`,
    );
    const page = unwrapApiEnvelope(response);
    requireSupportedRuntimeCompatibility(page.runtimeCompatibility);
    return page;
  },

  async savePageSchema(
    pageId: string,
    schema: PageSchema,
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
