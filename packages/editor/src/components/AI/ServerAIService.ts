import { AIRequest, AIResponse, AIService } from "./types";
import type { A2UISchema } from "@lowcode-platform/types";

export class ServerAIService implements AIService {
  name: string = "Server AI Service";
  private readonly baseUrl = "/api/v1/ai";

  constructor() {}

  isAvailable(): boolean {
    return true;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...(request.context?.conversationHistory || []),
            { role: "user", content: request.prompt },
          ],
          modelId: request.modelId,
          temperature: request.options?.temperature,
          maxTokens: request.options?.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "AI service request failed");
      }

      const data = await response.json();
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
      const response = await fetch(`${this.baseUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...(request.context?.conversationHistory || []),
            { role: "user", content: request.prompt },
          ],
          modelId: request.modelId,
          temperature: request.options?.temperature,
          maxTokens: request.options?.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Stream request failed" }));
        throw new Error(error.message || "Stream request failed");
      }

      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // AI SDK pipeTextStreamToResponse 直接输出纯文本流
          // 每个 chunk 就是文本片段
          onMessage(trimmed);
        }
      }

      // 处理 buffer 中剩余内容
      if (buffer.trim()) {
        onMessage(buffer.trim());
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
