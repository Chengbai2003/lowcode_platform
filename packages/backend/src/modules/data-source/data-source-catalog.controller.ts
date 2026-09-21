import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { DataSourceCatalogService } from './data-source-catalog.service';
import { DataSourceOperationsQueryDto } from './dto/data-source-operations-query.dto';

/**
 * 数据源操作目录路由（M1b-1 PR D）。
 *
 * `GET /api/v1/data-source/operations?pageId=&pageVersion=`：只读目录，
 * 按页面级可信身份过滤。身份未配置 → 200 + 空列表（fail-close，不暴露
 * 任何条目）。沿用共享密钥 AuthGuard，不新增任何认证体系；目录过滤
 * 不替代 B 的逐请求授权。
 */
@Controller('data-source')
@UseGuards(AuthGuard)
export class DataSourceCatalogController {
  constructor(private readonly catalogService: DataSourceCatalogService) {}

  @Get('operations')
  async listOperations(@Query() query: DataSourceOperationsQueryDto) {
    const result = await this.catalogService.listOperationsForPage(query.pageId, query.pageVersion);
    return { operations: result.operations };
  }
}
