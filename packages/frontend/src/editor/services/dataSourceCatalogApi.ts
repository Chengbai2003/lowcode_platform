/**
 * 数据源操作目录消费（M1b-1 PR D / 计划 §3.3）。
 *
 * `GET /api/v1/data-source/operations?pageId=&pageVersion=`：只读目录，
 * 按页面级可信身份过滤（身份未配置 → 空列表）。pageId 与 pageVersion
 * 必填（无 latest 语义，与 B 执行端点一致）。目录过滤不替代执行授权。
 */

import { fetchApp } from '../lib/httpClient';
import { type ApiEnvelope, unwrapApiEnvelope } from '../lib/apiResponse';

export interface DataSourceOperationSummary {
  readonly operationId: string;
  readonly revision: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'readonly-query';
  readonly paramsContract: Readonly<
    Record<
      string,
      {
        readonly type: 'string' | 'integer';
        readonly required: boolean;
        readonly maxLength?: number;
        readonly min?: number;
        readonly max?: number;
      }
    >
  >;
}

export async function listDataSourceOperations(
  pageId: string,
  pageVersion: number,
): Promise<readonly DataSourceOperationSummary[]> {
  const query = `pageId=${encodeURIComponent(pageId)}&pageVersion=${encodeURIComponent(
    String(pageVersion),
  )}`;
  const response = await fetchApp.get<
    | { operations: readonly DataSourceOperationSummary[] }
    | ApiEnvelope<{
        operations: readonly DataSourceOperationSummary[];
      }>
  >(`/api/v1/data-source/operations?${query}`);
  const payload = unwrapApiEnvelope(response);
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { operations?: unknown }).operations)
  ) {
    throw new Error('Unexpected data source catalog response shape (expected operations array)');
  }
  return (payload as { operations: readonly DataSourceOperationSummary[] }).operations;
}
