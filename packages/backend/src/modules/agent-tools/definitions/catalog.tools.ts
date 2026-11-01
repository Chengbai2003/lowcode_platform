import { DataSourceCatalogService } from '../../data-source/data-source-catalog.service';
import { ToolDefinition } from '../types/tool.types';
import { createObjectSchema } from '../tool-input.coerce';

export interface CatalogToolsDeps {
  dataSourceCatalogService?: DataSourceCatalogService;
}

/**
 * 数据源目录工具（M1b-1 PR D）：Agent 只获得有权使用的操作公开描述。
 *
 * 以工具执行上下文的 (pageId, resolvedPageVersion) 解析页面级可信身份，
 * 过滤规则与 HTTP 目录路由共用 DataSourceCatalogService（单一实现）。
 * 目录未配置 / 上下文缺页面 / 身份未解析 → 空目录 + 警告（fail-close）。
 * 目录过滤不替代 B 的逐请求授权。
 */
export function createCatalogDefinitions(deps: CatalogToolsDeps): ToolDefinition[] {
  const { dataSourceCatalogService } = deps;
  return [
    {
      name: 'list_data_source_operations',
      description:
        '列出当前页面身份有权使用的只读数据源操作目录（operationId/revision/参数契约）。' +
        '配置 executeDataSource 前先调用本工具获取可用操作。',
      inputSchema: createObjectSchema(
        '列出当前页面可用的数据源操作；以工具上下文的页面与版本解析身份，无需额外参数。',
        {},
      ),
      visibility: 'agent',
      execute: async (_input, context) => {
        if (!dataSourceCatalogService) {
          return {
            data: { operations: [] },
            warnings: ['Data source catalog is not configured in this deployment (fail-close)'],
          };
        }
        const pageId = context.pageId;
        const pageVersion = context.resolvedPageVersion ?? context.basePageVersion;
        if (!pageId || typeof pageVersion !== 'number') {
          return {
            data: { operations: [] },
            warnings: [
              'Data source catalog requires a pageId and a resolved pageVersion in the tool context',
            ],
          };
        }
        const result = await dataSourceCatalogService.listOperationsForPage(pageId, pageVersion);
        return {
          data: { operations: result.operations },
          warnings: result.identityResolved
            ? undefined
            : ['No page identity resolved; the operation catalog is empty (fail-close)'],
        };
      },
    },
  ];
}
