import { Injectable } from '@nestjs/common';
import {
  DataSourceIdentityAdapter,
  TrustedDataSourceIdentity,
} from './data-source-identity.adapter';
import { listTrustedOperationDefinitions } from './trusted-operation-registry';

/**
 * 数据源操作目录（M1b-1 PR D）。
 *
 * 目录 = 可信注册 summaries ∩ 页面级身份权限（grantedPermissions 包含
 * requiredPermission）。身份未配置/未解析 → 空目录（fail-close，不暴露
 * 任何条目）。
 *
 * 边界红线：目录过滤只是视图层便利，绝不替代 B 的逐请求授权 ——
 * 执行仍必须走 DataSourceExecutionService 的完整管线（快照声明 →
 * 受信 operation → resolveIdentity → permission）。
 */
@Injectable()
export class DataSourceCatalogService {
  constructor(private readonly identityAdapter: DataSourceIdentityAdapter) {}

  async listOperationsForPage(
    pageId: string,
    pageVersion: number,
  ): Promise<{
    readonly operations: readonly {
      readonly operationId: string;
      readonly revision: string;
      readonly title: string;
      readonly description: string;
      readonly kind: 'readonly-query';
      readonly paramsContract: ReturnType<
        typeof listTrustedOperationDefinitions
      >[number]['paramsContract'];
    }[];
    readonly identityResolved: boolean;
  }> {
    const identity = await this.identityAdapter.resolvePageIdentity({ pageId, pageVersion });
    if (!identity) {
      return { operations: [], identityResolved: false };
    }
    const operations = listTrustedOperationDefinitions()
      .filter((definition) => hasPermission(identity, definition.requiredPermission))
      .map((definition) => ({
        operationId: definition.operationId,
        revision: definition.revision,
        title: definition.title,
        description: definition.description,
        kind: definition.kind,
        paramsContract: definition.paramsContract,
      }));
    return { operations, identityResolved: true };
  }
}

function hasPermission(identity: TrustedDataSourceIdentity, requiredPermission: string): boolean {
  return identity.grantedPermissions.has(requiredPermission);
}
