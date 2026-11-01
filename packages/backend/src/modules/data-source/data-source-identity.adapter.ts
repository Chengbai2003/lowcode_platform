import { Injectable } from '@nestjs/common';

/**
 * 数据源执行身份适配器端口（M1b-1 PR B；PR D 扩展页面级解析）。
 *
 * 用户/租户身份只能由服务端可信适配器给出：页面标识不是凭据，
 * 请求不携带身份，params 不能授予任何权限。适配器可以基于
 * `(pageId, pageVersion, sourceId)` 做页面级授权 —— 返回 undefined
 * 即拒绝该次执行。
 *
 * PR D 新增 `resolvePageIdentity`（页面级身份，供操作目录过滤）：
 * 具体方法默认返回 undefined（fail-close）——未接入页面级解析的
 * 既有适配器零改动继承默认，目录保持为空。目录过滤只是视图层便利，
 * 不替代逐请求的 `resolveIdentity` 授权。
 *
 * 默认实现是「未配置」：任何部署在未接入真实身份适配器前，
 * 新端点对所有请求确定性拒绝（fail-close）。
 */
export abstract class DataSourceIdentityAdapter {
  abstract resolveIdentity(context: {
    readonly pageId: string;
    readonly pageVersion: number;
    readonly sourceId: string;
  }): Promise<TrustedDataSourceIdentity | undefined> | TrustedDataSourceIdentity | undefined;

  /**
   * 页面级身份解析（PR D）：按 `(pageId, pageVersion)` 返回页面所属
   * 身份。默认 fail-close（undefined → 空目录），仅供目录过滤；
   * 执行授权仍必须走 `resolveIdentity` 逐请求判定。
   */
  resolvePageIdentity(context: {
    readonly pageId: string;
    readonly pageVersion: number;
  }): Promise<TrustedDataSourceIdentity | undefined> | TrustedDataSourceIdentity | undefined {
    void context;
    return undefined;
  }
}

export interface TrustedDataSourceIdentity {
  readonly userId: string;
  readonly tenantId: string;
  /** 已授予权限集合；操作执行需要注册项声明的 requiredPermission */
  readonly grantedPermissions: ReadonlySet<string>;
}

@Injectable()
export class UnconfiguredDataSourceIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): undefined {
    return undefined;
  }
}
