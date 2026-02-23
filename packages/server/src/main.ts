/**
 * 低代码平台后端服务入口
 * NestJS + AI Provider 架构
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 获取配置
  const port = configService.get<number>('app.port', 3000);
  const env = configService.get<string>('app.env', 'development');
  const corsEnabled = configService.get<boolean>('app.cors', true);

  // 启用CORS
  if (corsEnabled) {
    app.enableCors({
      origin: configService.get('app.corsOrigin', '*'),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
  }

  // 全局管道：验证DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动移除未定义的属性
      forbidNonWhitelisted: true, // 拒绝包含未定义属性的请求
      transform: true, // 自动类型转换
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局过滤器：异常处理
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局拦截器
  app.useGlobalInterceptors(
    new LoggingInterceptor(), // 日志记录
    new TransformInterceptor(), // 响应格式统一
  );

  // 设置全局前缀
  app.setGlobalPrefix('api/v1');

  // 启动服务
  await app.listen(port);

  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║           低代码平台后端服务已启动 🚀                      ║
  ╠════════════════════════════════════════════════════════════╣
  ║  环境: ${env.padEnd(47)}║
  ║  端口: ${port.toString().padEnd(47)}║
  ║  API地址: http://localhost:${port}/api/v1${''.padEnd(26)}║
  ╚════════════════════════════════════════════════════════════╝
  `);
}

// 启动应用
bootstrap().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
