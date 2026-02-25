/**
 * AI 控制器
 * 处理 AI 相关的 HTTP 请求
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { Observable } from "rxjs";
import { AIService } from "./ai.service";
import { ChatRequestDto, GenerateSchemaDto } from "./dto/chat-request.dto";
import { SaveModelDto } from "./dto/save-model.dto";
import { DeleteModelDto } from "./dto/delete-model.dto";
import { StreamChunk } from "./providers/ai-provider.interface";
import { ModelConfigService } from "./model-config.service";

@Controller("ai")
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly aiService: AIService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  /**
   * 聊天接口
   */
  @Post("chat")
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto) {
    this.logger.log(`[chat] Provider: ${dto.provider || "default"}`);
    return this.aiService.chat(dto);
  }

  /**
   * 流式聊天接口（SSE）
   */
  @Post("chat/stream")
  @HttpCode(HttpStatus.OK)
  async chatStream(
    @Body() dto: ChatRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    this.logger.log(`[chatStream] Provider: ${dto.provider || "default"}`);

    // 设置 SSE 响应头
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");

    try {
      const stream = this.aiService.chatStream(dto);

      // 订阅流并写入响应
      const subscription = stream.subscribe({
        next: (chunk: StreamChunk) => {
          // Filter out chunks with empty content
          if (!chunk.choices?.[0]?.delta?.content) {
            return;
          }
          const data = JSON.stringify(chunk);
          response.write(`data: ${data}\n\n`);
        },
        error: (error) => {
          this.logger.error("[chatStream] Stream error:", error);
          const errorData = JSON.stringify({
            error: true,
            message: (error as any).message,
          });
          response.write(`data: ${errorData}\n\n`);
          response.end();
        },
        complete: () => {
          this.logger.log("[chatStream] Stream completed");
          response.write("data: [DONE]\n\n");
          response.end();
        },
      });

      // 客户端断开连接时取消订阅
      response.on("close", () => {
        this.logger.log("[chatStream] Client disconnected");
        subscription.unsubscribe();
      });
    } catch (error) {
      this.logger.error("[chatStream] Failed to start stream:", error);
      const errorData = JSON.stringify({
        error: true,
        message: (error as any).message,
      });
      response.write(`data: ${errorData}\n\n`);
      response.end();
    }
  }

  /**
   * 生成组件 Schema
   */
  @Post("generate-schema")
  @HttpCode(HttpStatus.OK)
  async generateSchema(@Body() dto: GenerateSchemaDto) {
    this.logger.log(`[generateSchema] Provider: ${dto.provider || "default"}`);
    return this.aiService.generateSchema(dto);
  }

  /**
   * 流式生成组件 Schema
   */
  @Post("generate-schema/stream")
  @HttpCode(HttpStatus.OK)
  async generateSchemaStream(
    @Body() dto: GenerateSchemaDto,
    @Res() response: Response,
  ): Promise<void> {
    this.logger.log(
      `[generateSchemaStream] Provider: ${dto.provider || "default"}`,
    );

    // 设置 SSE 响应头
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");

    try {
      const stream = this.aiService.generateSchemaStream(dto);

      const subscription = stream.subscribe({
        next: (chunk: StreamChunk) => {
          const data = JSON.stringify(chunk);
          response.write(`data: ${data}\n\n`);
        },
        error: (error) => {
          this.logger.error("[generateSchemaStream] Stream error:", error);
          const errorData = JSON.stringify({
            error: true,
            message: (error as any).message,
          });
          response.write(`data: ${errorData}\n\n`);
          response.end();
        },
        complete: () => {
          this.logger.log("[generateSchemaStream] Stream completed");
          response.write("data: [DONE]\n\n");
          response.end();
        },
      });

      response.on("close", () => {
        this.logger.log("[generateSchemaStream] Client disconnected");
        subscription.unsubscribe();
      });
    } catch (error) {
      this.logger.error(
        "[generateSchemaStream] Failed to start stream:",
        error,
      );
      const errorData = JSON.stringify({
        error: true,
        message: (error as any).message,
      });
      response.write(`data: ${errorData}\n\n`);
      response.end();
    }
  }

  /**
   * 获取所有可用的 Provider
   */
  @Get("providers")
  getProviders() {
    return {
      providers: this.aiService.getAvailableProviders(),
    };
  }

  /**
   * 获取所有 Provider 的状态
   */
  @Get("providers/status")
  async getProviderStatus() {
    const status = await this.aiService.getProviderHealth();
    return {
      providers: status,
    };
  }

  /**
   * 检查特定 Provider 的健康状态
   */
  @Get("providers/:name/health")
  async checkProviderHealth(@Query("name") name: string) {
    const status = await this.aiService.getProviderHealth(name);
    return {
      provider: status[0],
    };
  }

  /**
   * 获取所有模型配置
   */
  @Get("models")
  getModels() {
    const customModels = this.modelConfigService.getAllModels();
    const defaultProviders = this.aiService.getAllProviderStatus();

    // 将默认 Provider 转换为 Model 配置格式
    const defaultModels = defaultProviders
      .filter((p) => p.config && !customModels.some((m) => m.id === p.name)) // 避免重复 (如果用户覆盖了默认同名配置)
      .map((p) => ({
        id: p.name,
        name: `${p.name.charAt(0).toUpperCase() + p.name.slice(1)} (Env Config)`,
        provider: p.name,
        model: p.config?.model,
        isDefault: p.name === "openai", // 默认选中 openai
        isAvailable: p.available,
        createdAt: 0,
        updatedAt: 0,
      }));

    return [...defaultModels, ...customModels];
  }

  /**
   * 保存模型配置
   */
  @Post("models")
  saveModel(@Body() config: SaveModelDto) {
    return this.modelConfigService.saveModel(config);
  }

  /**
   * 删除模型配置
   */
  @Get("models/:id/delete") // 使用 GET 以方便调试，实际应使用 DELETE
  deleteModelGet(@Query("id") id: string) {
    return this.modelConfigService.deleteModel(id);
  }

  @Post("models/delete")
  deleteModelPost(@Body() body: DeleteModelDto) {
    return this.modelConfigService.deleteModel(body.id);
  }
}
