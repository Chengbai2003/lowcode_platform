import {
  AIService,
  AIRequest,
  AIResponse,
  AIServiceError,
} from "../types/ai-types";

class ServerAIService implements AIService {
  name = "ServerAIService";

  async isAvailable(): Promise<boolean> {
    // Check if server-side AI service is available
    try {
      // This would typically make a call to the backend AI endpoint
      return true; // Simplified for now
    } catch (error) {
      return false;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      // Call backend AI service
      const response = await fetch("/api/v1/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new AIServiceError(
          `AI service responded with status ${response.status}`,
          "NETWORK_ERROR",
          { status: response.status },
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw new AIServiceError(
        error instanceof Error ? error.message : "Unknown error occurred",
        "NETWORK_ERROR",
        error,
      );
    }
  }

  async streamResponse(
    request: AIRequest,
    onMessage: (chunk: string) => void,
    onError?: (error: any) => void,
  ): Promise<void> {
    try {
      const response = await fetch("/api/v1/ai/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok || !response.body) {
        throw new AIServiceError(
          `AI service responded with status ${response.status}`,
          "NETWORK_ERROR",
          { status: response.status },
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          onMessage(chunk);
        }
      }
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        throw error;
      }
    }
  }
}

export const serverAIService = new ServerAIService();
