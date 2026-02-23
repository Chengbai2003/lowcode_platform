/**
 * AI 模块
 * 提供 AI 相关的功能，包括聊天、代码生成等
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { ModelConfigService } from './model-config.service';
import { AIProviderFactory } from './providers/ai-provider.factory';

@Module({
  imports: [ConfigModule],
  controllers: [AIController],
  providers: [AIService, AIProviderFactory, ModelConfigService],
  exports: [AIService, AIProviderFactory, ModelConfigService],
})
export class AiModule { }
