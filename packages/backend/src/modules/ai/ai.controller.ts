/**
 * AI 控制器 (Vercel AI SDK)
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
  UseGuards,
  Param,
  Delete,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AIService } from './ai.service';
import { ChatRequestDto, GenerateSchemaDto } from './dto/chat-request.dto';
import { SaveModelDto } from './dto/save-model.dto';
import { DeleteModelDto } from './dto/delete-model.dto';
import { ModelConfigService } from './model-config.service';

@Controller('ai')
@UseGuards(AuthGuard)
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly aiService: AIService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  // ---- Chat ----

  /**
   * 聊天接口
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatRequestDto) {
    this.logger.log(`[chat] Provider: ${dto.provider || 'default'}`);
    return this.aiService.chat(dto);
  }

  /**
   * 流式聊天接口（SSE）
   */
  @Post('chat/stream')
  @HttpCode(HttpStatus.OK)
  async chatStream(@Body() dto: ChatRequestDto, @Res() response: Response) {
    this.logger.log(`[chatStream] Provider: ${dto.provider || 'default'}`);

    const result = await this.aiService.chatStream(dto);
    // AI SDK
    result.pipeTextStreamToResponse(response);
  }

  // ---- Schema Generation ----

  /**
   * 生成组件 Schema
   */
  @Post('generate-schema')
  @HttpCode(HttpStatus.OK)
  async generateSchema(@Body() dto: GenerateSchemaDto) {
    this.logger.log(`[generateSchema] Provider: ${dto.provider || 'default'}`);
    return this.aiService.generateSchema(dto);
  }

  /**
   * 流式生成组件 Schema
   */
  @Post('generate-schema/stream')
  @HttpCode(HttpStatus.OK)
  async generateSchemaStream(@Body() dto: GenerateSchemaDto, @Res() response: Response) {
    this.logger.log(`[generateSchemaStream] Provider: ${dto.provider || 'default'}`);

    const result = await this.aiService.generateSchemaStream(dto);
    result.pipeTextStreamToResponse(response);
  }

  // ---- Provider / Model Management (Security Hardened) ----

  /**
   * 安全地移除响应体中的敏感字段
   */
  private sanitizeModel(model: any) {
    if (!model) return undefined;

    // 如果是深层对象或者是我们在后端使用的类型需要剥离暴露在前端的 apiKey
    const safeModel = { ...model };

    // 移除顶层 apiKey
    if ('apiKey' in safeModel) {
      delete safeModel.apiKey;
    }

    // 如果存在 config 对象，深拷贝并移除 apiKey
    if (safeModel.config && typeof safeModel.config === 'object') {
      const safeConfig = { ...safeModel.config };
      if ('apiKey' in safeConfig) {
        delete safeConfig.apiKey;
      }
      safeModel.config = safeConfig;
    }

    return safeModel;
  }

  /**
   * 获取所有可用的 Provider
   */
  @Get('providers')
  getProviders() {
    return { providers: this.aiService.getAvailableProviders() };
  }

  /**
   * 获取所有 Provider 的状态
   */
  @Get('providers/status')
  async getProviderStatus() {
    const statuses = await this.aiService.getAllProviderStatus();
    return { providers: statuses.map((s) => this.sanitizeModel(s)) };
  }

  /**
   * 检查特定 Provider 的健康状态
   */
  @Get('providers/:name/health')
  async checkProviderHealth(@Param('name') name: string) {
    return { provider: (await this.aiService.getProviderHealth(name))[0] };
  }

  /**
   * 获取所有模型配置
   */
  @Get('models')
  getModels() {
    const customModels = this.modelConfigService.getAllModels();
    const defaultProviders = this.aiService.getAllProviderStatus();

    const defaultModels = defaultProviders
      .filter((p) => p.config && !customModels.some((m) => m.id === p.name))
      .map((p) => ({
        id: p.name,
        name: `${p.name.charAt(0).toUpperCase() + p.name.slice(1)} (Env Config)`,
        provider: p.name,
        model: p.config?.model,
        isDefault: p.name === 'openai',
        isAvailable: p.available,
        createdAt: 0,
        updatedAt: 0,
      }));

    return [...defaultModels, ...customModels].map((m) => this.sanitizeModel(m));
  }

  /**
   * 保存模型配置
   */
  @Post('models')
  saveModel(@Body() config: SaveModelDto) {
    return this.modelConfigService.saveModel(config);
  }

  /**
   * 删除模型配置 (Restful)
   */
  @Delete('models/:id')
  deleteModel(@Param('id') id: string) {
    return this.modelConfigService.deleteModel(id);
  }
}
