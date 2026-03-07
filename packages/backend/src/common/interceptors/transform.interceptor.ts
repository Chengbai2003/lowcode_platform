/**
 * 响应转换拦截器
 * 统一API响应格式
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
  path: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const path = request.url;

    return next.handle().pipe(
      map((data) => {
        // 如果数据已经是标准格式，直接返回
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // 处理分页数据
        let response: ApiResponse<T>;
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          // 已经是 { data, meta } 格式
          response = {
            success: true,
            data: data.data,
            message: 'Success',
            timestamp: new Date().toISOString(),
            path,
            meta: data.meta,
          };
        } else {
          // 普通数据
          response = {
            success: true,
            data,
            message: 'Success',
            timestamp: new Date().toISOString(),
            path,
          };
        }

        return response;
      }),
    );
  }
}
