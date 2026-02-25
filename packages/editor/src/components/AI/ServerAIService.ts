import { AIRequest, AIResponse, AIService } from "./types";
import type { A2UISchema } from "@lowcode-platform/types";

export class ServerAIService implements AIService {
  name: string = "Server AI Service";
  private readonly baseUrl = "/api/v1/ai"; // 假设后端 API 前缀

  // 不再依赖构造函数传入 modelId
  constructor() {}

  isAvailable(): boolean {
    return true; // 服务端服务总是被认为是可用的
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...(request.context?.conversationHistory || []),
            { role: "user", content: request.prompt },
          ],
          modelId: request.modelId, // 传递 modelId
          temperature: request.options?.temperature,
          maxTokens: request.options?.maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "AI service request failed");
      }

      const data = await response.json();

      // 假设后端返回格式为标准 ChatResponse，我们需要转换为 AIResponse
      // 注意：这里需要根据实际后端返回调整
      const content = data.choices[0]?.message?.content || "";

      // 尝试解析 JSON schema 如果存在
      let schema: A2UISchema | undefined;
      try {
        const jsonMatch =
          content.match(/```json\n([\s\S]*?)\n```/) ||
          content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          schema = JSON.parse(jsonStr);
        }
      } catch (e) {
        // 解析失败忽略
        console.warn("Failed to parse schema from response", e);
      }

      return {
        content,
        schema,
        usage: data.usage,
      };
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...(request.context?.conversationHistory || []),
            { role: "user", content: request.prompt },
          ],
          modelId: request.modelId, // 传递 modelId
          temperature: request.options?.temperature,
          maxTokens: request.options?.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: "Stream request failed" }));
        throw new Error(error.message || "Stream request failed");
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6); // Remove 'data: ' prefix
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.message || "Stream error");
            }
            // 后端返回的 chunk 是 OpenAI StreamChunk 格式
            const content =
              parsed.choices?.[0]?.delta?.content || parsed.content;
            if (content) {
              onMessage(content);
            }
          } catch (e) {
            // JSON parse error or logic error
            console.warn("Error parsing stream data:", e, data);
          }
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
