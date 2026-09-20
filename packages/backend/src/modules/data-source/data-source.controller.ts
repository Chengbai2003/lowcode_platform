import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { DataSourceExecutionService } from './data-source-execution.service';

export class ExecuteDataSourceDto {
  @IsInt()
  @Min(1)
  pageVersion!: number;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

const ALLOWED_BODY_FIELDS = new Set(['pageVersion', 'params']);

/**
 * 只读数据源执行端点（M1b-1 PR B）。
 *
 * 路由携带 pageId/sourceId（路径参数权威，请求体不可与之错位）；
 * 权威校验在 DataSourceExecutionService（含能力门禁、身份与注册解析），
 * 此处仅做请求体形状的提前 fail-close，不重复业务规则。
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
    @Body() dto: ExecuteDataSourceDto,
  ) {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
      return this.executionService.execute({ pageId, pageVersion: undefined, sourceId });
    }
    for (const field of Object.keys(dto)) {
      if (!ALLOWED_BODY_FIELDS.has(field)) {
        return this.executionService.execute({
          pageId,
          pageVersion: undefined,
          sourceId,
          [field]: (dto as unknown as Record<string, unknown>)[field],
        });
      }
    }
    return this.executionService.execute({
      pageId,
      pageVersion: dto.pageVersion,
      sourceId,
      params: dto.params,
    });
  }
}
