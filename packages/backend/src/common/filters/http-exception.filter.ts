/**
 * HTTP异常过滤器
 * 统一处理所有HTTP异常，返回标准格式的错误响应
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: any;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // 构建标准错误响应
    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: this.getErrorMessage(exceptionResponse),
      error: this.getErrorName(status),
      timestamp: new Date().toISOString(),
      path: request.url,
      details: this.getErrorDetails(exceptionResponse),
    };

    // 记录错误日志
    this.logger.error(
      `${request.method} ${request.url} ${status} - ${errorResponse.message}`,
      exception.stack,
    );

    response.status(status).json(errorResponse);
  }

  private getErrorMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      return (exceptionResponse as any).message || 'An error occurred';
    }
    return 'An error occurred';
  }

  private getErrorName(status: number): string {
    const statusNames: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
      [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
    };
    return statusNames[status] || 'Unknown Error';
  }

  private getErrorDetails(exceptionResponse: string | object): any {
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const { message, statusCode, error, ...details } = exceptionResponse as any;
      return Object.keys(details).length > 0 ? details : undefined;
    }
    return undefined;
  }
}
