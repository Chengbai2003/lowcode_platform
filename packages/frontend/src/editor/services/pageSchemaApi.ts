import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
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
  const expected = ANTD_RUNTIME_COMPATIBILITY;
  if (
    !runtimeCompatibility ||
    runtimeCompatibility.componentPresetId !== expected.componentPresetId ||
    runtimeCompatibility.componentPresetVersion !== expected.componentPresetVersion ||
    runtimeCompatibility.rendererVersion !== expected.rendererVersion
  ) {
    throw new Error(
      `[PageSchema] Unsupported runtimeCompatibility: ${JSON.stringify(runtimeCompatibility ?? null)}`,
    );
  }
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
