import { Module } from '@nestjs/common';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { DataSourceController } from './data-source.controller';
import { DataSourceExecutor } from './data-source-executor';
import { DataSourceExecutionService } from './data-source-execution.service';
import {
  DataSourceIdentityAdapter,
  UnconfiguredDataSourceIdentityAdapter,
} from './data-source-identity.adapter';
import { DATA_SOURCE_UPSTREAM_TARGETS, EMPTY_UPSTREAM_TARGETS } from './upstream-targets.provider';

/**
 * 只读数据源执行模块（M1b-1 PR B）。
 *
 * 默认部署即 fail-close：身份适配器未配置（所有请求 FORBIDDEN）、
 * 上游目标绑定为空（FORBIDDEN）、data-source 能力六面 unsupported
 * （CAPABILITY_DENIED）——端点存在但不开放匿名生产路由。可信测试配置
 * 通过 overrideProvider 注入测试身份与 loopback 目标绑定，不修改生产默认。
 */
@Module({
  imports: [PageSchemaModule],
  controllers: [DataSourceController],
  providers: [
    DataSourceExecutor,
    { provide: DataSourceIdentityAdapter, useClass: UnconfiguredDataSourceIdentityAdapter },
    { provide: DATA_SOURCE_UPSTREAM_TARGETS, useValue: EMPTY_UPSTREAM_TARGETS },
    {
      provide: DataSourceExecutionService,
      useFactory: (
        pageSchemaService: PageSchemaService,
        identityAdapter: DataSourceIdentityAdapter,
        executor: DataSourceExecutor,
        upstreamTargets: Record<string, string>,
      ) =>
        new DataSourceExecutionService(
          pageSchemaService,
          identityAdapter,
          executor,
          upstreamTargets,
        ),
      inject: [
        PageSchemaService,
        DataSourceIdentityAdapter,
        DataSourceExecutor,
        DATA_SOURCE_UPSTREAM_TARGETS,
      ],
    },
  ],
  exports: [DataSourceExecutionService],
})
export class DataSourceModule {}
