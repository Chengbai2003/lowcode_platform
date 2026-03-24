import { type ApiEnvelope, unwrapApiEnvelope } from '../../../lib/apiResponse';
import { toAIServiceError } from '../../../lib/aiError';
import { fetchApp } from '../../../lib/httpClient';
import {
  AIService,
  type AgentEditRequest,
  type AgentEditResponse,
  type AgentStreamEvent,
  type AgentStreamResponseResult,
} from '../types/ai-types';

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
        sessionId: request.sessionId,
        confirmedScopeId: request.confirmedScopeId,
        confirmedIntentId: request.confirmedIntentId,
        requestIdempotencyKey: request.requestIdempotencyKey,
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

  async streamResponse(
    request: AgentEditRequest,
    handlers: {
      onEvent: (event: AgentStreamEvent) => void | Promise<void>;
    },
  ): Promise<AgentStreamResponseResult> {
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
        sessionId: request.sessionId,
        confirmedScopeId: request.confirmedScopeId,
        confirmedIntentId: request.confirmedIntentId,
        requestIdempotencyKey: request.requestIdempotencyKey,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
        stream: true,
        responseMode: request.responseMode ?? 'schema',
      };

      const response = await fetchApp.streamRequest('/api/v1/agent/edit/stream', payload);
      if (!response.body) {
        throw new Error('Empty stream response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let terminal: AgentStreamResponseResult['terminal'] | undefined;

      const handleFrame = async (frame: string) => {
        const normalized = frame.trim();
        if (!normalized) {
          return;
        }

        let eventName = '';
        const dataLines: string[] = [];
        for (const line of normalized.split(/\r?\n/)) {
          if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trim());
          }
        }

        if (!eventName || dataLines.length === 0) {
          return;
        }

        const payload = JSON.parse(dataLines.join('\n')) as AgentStreamEvent;
        if (payload.type === 'result') {
          terminal = 'result';
        } else if (payload.type === 'error') {
          terminal = 'error';
        }
        await handlers.onEvent(payload);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          await handleFrame(frame);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        await handleFrame(buffer);
      }

      if (!terminal) {
        throw new Error('Stream finished without terminal event');
      }

      return { terminal };
    } catch (error) {
      throw toAIServiceError(error);
    }
  }
}

export const serverAIService = new ServerAIService();
