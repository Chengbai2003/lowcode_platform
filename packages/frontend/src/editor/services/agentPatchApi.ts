import { type ApiEnvelope, unwrapApiEnvelope } from '../lib/apiResponse';
import { fetchApp } from '../lib/httpClient';
import type { PatchPreviewRequest, PatchPreviewResponse } from '../types/patch';

export const agentPatchApi = {
  async previewPatch(payload: PatchPreviewRequest): Promise<PatchPreviewResponse> {
    const response = await fetchApp.post<PatchPreviewResponse | ApiEnvelope<PatchPreviewResponse>>(
      '/api/v1/agent/patch/preview',
      payload,
    );
    return unwrapApiEnvelope(response);
  },
};
