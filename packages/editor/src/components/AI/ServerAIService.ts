import { AIRequest, AIResponse, AIService } from "./types";
import type { A2UISchema } from "@lowcode-platform/types";
import { fetchApp } from "../../lib/httpClient";

export class ServerAIService implements AIService {
  name: string = "Server AI Service";
  private readonly baseUrl = "/api/v1/ai";

  constructor() { }

  isAvailable(): boolean {
    return true;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      const data = await fetchApp.post(`${this.baseUrl}/chat`, {
        messages: [
          ...(request.context?.conversationHistory || []),
          { role: "user", content: request.prompt },
        ],
        modelId: request.modelId,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
      });

      const content = data.content || "";

      let schema: A2UISchema | undefined;
      try {
        const jsonMatch =
          content.match(/```json\n([\s\S]*?)\n```/) ||
          content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          schema = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
      } catch (e) {
        console.warn("Failed to parse schema from response", e);
      }

      return { content, schema, usage: data.usage };
    } catch (error) {
      console.error("ServerAIService generateResponse error:", error);
      throw error;
    }
  }

  async streamResponse(
    request: AIRequest,
    onMessage: (chunk: string) => void,
    onError?: (error: any) => void,
  ): Promise<void> {
    try {
      const response = await fetchApp.streamRequest(`${this.baseUrl}/chat/stream`, {
        messages: [
          ...(request.context?.conversationHistory || []),
          { role: "user", content: request.prompt },
        ],
        modelId: request.modelId,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
      });

      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // AI SDK pipeTextStreamToResponse 直接输出纯文本流
        // 每个 chunk 就是文本片段，直接传给 onMessage
        const text = decoder.decode(value, { stream: true });
        if (text) {
          onMessage(text);
        }
      }
    } catch (error) {
      console.error("ServerAIService streamResponse error:", error);
      if (onError) {
        onError(error);
      } else {
        throw error;
      }
    }
  }
}

export const serverAIService = new ServerAIService();
