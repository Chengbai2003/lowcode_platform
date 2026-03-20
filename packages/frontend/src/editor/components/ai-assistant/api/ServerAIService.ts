import { type ApiEnvelope, unwrapApiEnvelope } from '../../../lib/apiResponse';
import { toAIServiceError } from '../../../lib/aiError';
import { fetchApp } from '../../../lib/httpClient';
import { AIService, type AgentEditRequest, type AgentEditResponse } from '../types/ai-types';

class ServerAIService implements AIService {
  name = 'ServerAIService';

  async isAvailable(): Promise<boolean> {
    // Check if server-side AI service is available
    try {
      // This would typically make a call to the backend AI endpoint
      return true; // Simplified for now
    } catch (error) {
      return false;
    }
  }

  async generateResponse(request: AgentEditRequest): Promise<AgentEditResponse> {
    try {
      const payload = {
        instruction: request.instruction,
        modelId: request.modelId,
        provider: request.provider,
        pageId: request.pageId,
        version: request.version,
        selectedId: request.selectedId,
        draftSchema: request.draftSchema,
        conversationHistory: request.conversationHistory,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
        stream: request.stream,
        responseMode: request.responseMode ?? 'schema',
      };

      const response = await fetchApp.post<AgentEditResponse | ApiEnvelope<AgentEditResponse>>(
        '/api/v1/agent/edit',
        payload,
      );
      return unwrapApiEnvelope(response);
    } catch (error) {
      throw toAIServiceError(error);
    }
  }
}

export const serverAIService = new ServerAIService();
