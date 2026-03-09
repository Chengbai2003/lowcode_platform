/**
 * 日志拦截器
 * 记录请求和响应信息
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const { method, url, body, query, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const ip = this.getClientIp(request);

    const startTime = Date.now();

    // 生成请求ID
    const requestId = this.generateRequestId();
    request.requestId = requestId;

    // 记录请求信息
    this.logger.log(`[${requestId}] ${method} ${url} - ${ip} - ${userAgent}`);

    // 开发环境记录请求体
    if (process.env.NODE_ENV === 'development' && Object.keys(body).length > 0) {
      this.logger.debug(`[${requestId}] Request Body:`, body);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(`[${requestId}] ${method} ${url} ${statusCode} - ${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.error(
            `[${requestId}] ${method} ${url} ${statusCode} - ${duration}ms - ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }

  /**
   * 获取客户端IP
   */
  private getClientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];

    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    if (realIp) {
      return realIp;
    }

    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  /**
   * 生成请求ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }
}
