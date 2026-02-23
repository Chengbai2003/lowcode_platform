/**
 * 应用根模块
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './modules/ai/ai.module';
import { CommonModule } from './modules/common/common.module';
import appConfig from './config/app.config';
import aiConfig from './config/ai.config';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    // 配置模块：加载环境变量和配置文件
    ConfigModule.forRoot({
      isGlobal: true, // 全局可用
      envFilePath: ['.env', `.env.${process.env.NODE_ENV || 'development'}`],
      load: [appConfig, aiConfig, databaseConfig],
      cache: true,
    }),

    // 限流模块：防止API滥用
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1秒
        limit: 10, // 每秒最多10个请求
      },
      {
        name: 'long',
        ttl: 60000, // 1分钟
        limit: 100, // 每分钟最多100个请求
      },
    ]),

    // 功能模块
    CommonModule,
    AiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
