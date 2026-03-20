import { type ApiEnvelope, unwrapApiEnvelope } from '../lib/apiResponse';
import { fetchApp } from '../lib/httpClient';
import type {
  AgentEditPatchResponse,
  AgentEditRequest,
} from '../components/ai-assistant/types/ai-types';

export const agentEditApi = {
  async editPatch(payload: AgentEditRequest): Promise<AgentEditPatchResponse> {
    const response = await fetchApp.post<
      AgentEditPatchResponse | ApiEnvelope<AgentEditPatchResponse>
    >('/api/v1/agent/edit', {
      ...payload,
      responseMode: 'patch',
    });

    return unwrapApiEnvelope(response);
  },
};
