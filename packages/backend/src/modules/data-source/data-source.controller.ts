import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { DataSourceExecutionService } from './data-source-execution.service';

const ALLOWED_BODY_FIELDS = new Set(['pageVersion', 'params']);

/**
 * 只读数据源执行端点（M1b-1 PR B）。
 *
 * 路由携带 pageId/sourceId（路径参数权威，请求体不可与之错位）。
 * 请求体以「未类型化」形式透传：全局 ValidationPipe 对 metatype 为
 * Object 的参数不做 whitelist 剥离、不做隐式类型转换、不做提前 400——
 * 因此生产入口与测试入口的权威判定完全一致，全部由
 * DataSourceExecutionService 的契约校验器给出带 traceId 的 INVALID_PARAMS，
 * 避免 `pageVersion: true`/"1" 被管道静默转换成合法值或未知字段得到
 * 无错误码的裸 400。
 */
@Controller('pages/:pageId/data-sources/:sourceId')
@UseGuards(AuthGuard)
export class DataSourceController {
  constructor(private readonly executionService: DataSourceExecutionService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(
    @Param('pageId') pageId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      // 非对象请求体原样交给契约校验器（固定得到 INVALID_PARAMS + traceId）
      return this.executionService.execute(body ?? null);
    }
    const record = body as Record<string, unknown>;
    const request: Record<string, unknown> = {
      pageId,
      pageVersion: record.pageVersion,
      sourceId,
    };
    if ('params' in record) {
      request.params = record.params;
    }
    // 未知字段原样带上（url/token 等），由契约校验器 fail-close 并点名
    for (const field of Object.keys(record)) {
      if (!ALLOWED_BODY_FIELDS.has(field)) {
        request[field] = record[field];
      }
    }
    return this.executionService.execute(request);
  }
}
