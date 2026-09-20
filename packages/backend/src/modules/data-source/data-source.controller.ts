import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { DataSourceExecutionService } from './data-source-execution.service';

/**
 * 只读数据源执行端点（M1b-1 PR B）。
 *
 * 路由携带 pageId/sourceId（路径参数权威）。请求体以「未类型化」形式
 * 交给服务层的端点入口（executeFromRoute）：全局 ValidationPipe 对
 * metatype 为 Object 的参数不做 whitelist 剥离、不做隐式类型转换、
 * 不做提前 400——生产入口与测试入口的权威判定完全一致，全部由
 * DataSourceExecutionService 给出带 traceId 的 INVALID_PARAMS，
 * 且请求体携带 pageId/sourceId（覆盖通道）在该入口被明确拒绝。
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
    return this.executionService.executeFromRoute(pageId, sourceId, body);
  }
}
