/**
 * 浏览器预览宿主的数据源适配器（M1b-1 PR D / 计划 §3.1–§3.2）。
 *
 * 唯一网络出口是 B 的 execute 端点（POST /pages/:pageId/data-sources/:sourceId/execute），
 * 绝不 fallback 到 fetch 直连上游或 context.api。映射表按计划 v3 冻结：
 * - 传输层用 fetchApp.request() 取原始 Response（.post() 的包装层会对非 2xx
 *   提前抛 HttpClientError，把 B 的结构化错误误归类为网络异常）；
 * - 成功与错误体均做完整字段校验，残缺体（如 {code:"TIMEOUT"}）不得生成
 *   违反 B 契约的 Outcome，统一落固定安全消息 + local- traceId；
 * - 本地失败 traceId 铸 `local-<uuid>`（`local-` 前缀 = 非服务端 trace 约定）；
 * - 调用前 / fetch reject / 响应体读取解析期间的 abort 均保持取消语义
 *   （抛 AbortError），绝不降级为失败 Outcome；
 * - 版本绑定四元组 {pageId,pageVersion,schemaRevision,generation} 仅在
 *   加载/保存成功铸造；脏页/切页/未保存 fail-close，零 HTTP。
 */

import {
  isDataSourceExecutionErrorCode,
  type DataSourceExecutionOutcome,
  type DataSourceHostExecuteInput,
  type JsonValue,
} from '@lowcode-platform/schema-contract';
import { fetchApp } from '../lib/httpClient';

const FIXED_UNEXPECTED_MESSAGE =
  'Unexpected response from the data source execution endpoint (fail-close)';
const FIXED_NETWORK_MESSAGE = 'Data source execution request failed (network error)';
export const DATA_SOURCE_BINDING_DIRTY_MESSAGE =
  'executeDataSource blocked: page draft is not saved — save the page first (binding stale, page dirty, or page switched)';

/** 本地铸造的非服务端 trace（`local-` 前缀标识未经 B 链路） */
export function mintLocalDataSourceTraceId(): string {
  const randomUUID =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `local-${randomUUID}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isJsonValueLike(value: unknown): boolean {
  const type = typeof value;
  return (
    value === null ||
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    Array.isArray(value) ||
    (type === 'object' && value !== undefined)
  );
}

/**
 * 纯映射函数（计划 §3.2 冻结映射表；测试与适配器共用）。
 *
 * body 为已解析的 JSON 值；undefined 表示响应体不是合法 JSON。
 */
export function mapDataSourceExecuteResponse(
  status: number,
  body: unknown,
  mintLocalTraceId: () => string = mintLocalDataSourceTraceId,
): DataSourceExecutionOutcome {
  const okStatus = typeof status === 'number' && status >= 200 && status <= 299;

  if (okStatus) {
    // 成功：TransformInterceptor 信封 {success:true, data:{ok:true,...}}，
    // 完整字段校验，任一畸形不当成功
    if (
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).success === true
    ) {
      const data = Object.getOwnPropertyDescriptor(body as Record<string, unknown>, 'data');
      const dataValue = data ? data.value : undefined;
      if (
        dataValue !== null &&
        typeof dataValue === 'object' &&
        !Array.isArray(dataValue) &&
        (dataValue as Record<string, unknown>).ok === true
      ) {
        const record = dataValue as Record<string, unknown>;
        const resultDesc = Object.getOwnPropertyDescriptor(record, 'result');
        const operationIdDesc = Object.getOwnPropertyDescriptor(record, 'operationId');
        const revisionDesc = Object.getOwnPropertyDescriptor(record, 'revision');
        const traceIdDesc = Object.getOwnPropertyDescriptor(record, 'traceId');
        if (
          resultDesc &&
          isJsonValueLike(resultDesc.value) &&
          operationIdDesc &&
          isNonEmptyString(operationIdDesc.value) &&
          revisionDesc &&
          isNonEmptyString(revisionDesc.value) &&
          traceIdDesc &&
          isNonEmptyString(traceIdDesc.value)
        ) {
          return {
            ok: true,
            result: resultDesc.value as JsonValue,
            operationId: operationIdDesc.value,
            revision: revisionDesc.value,
            traceId: traceIdDesc.value,
          };
        }
      }
    }
    return {
      ok: false,
      code: 'UPSTREAM_FAILURE',
      message: FIXED_UNEXPECTED_MESSAGE,
      traceId: mintLocalTraceId(),
    };
  }

  // 错误：HttpExceptionFilter 平铺体，完整字段校验（code/message/traceId）
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const codeDesc = Object.getOwnPropertyDescriptor(record, 'code');
    const messageDesc = Object.getOwnPropertyDescriptor(record, 'message');
    const traceIdDesc = Object.getOwnPropertyDescriptor(record, 'traceId');
    if (
      codeDesc &&
      isDataSourceExecutionErrorCode(codeDesc.value) &&
      messageDesc &&
      isNonEmptyString(messageDesc.value) &&
      traceIdDesc &&
      isNonEmptyString(traceIdDesc.value)
    ) {
      return {
        ok: false,
        code: codeDesc.value,
        message: messageDesc.value,
        traceId: traceIdDesc.value,
      };
    }
  }
  return {
    ok: false,
    code: 'UPSTREAM_FAILURE',
    message: FIXED_UNEXPECTED_MESSAGE,
    traceId: mintLocalTraceId(),
  };
}

/** 预览宿主的版本绑定快照（仅在页面加载成功/保存成功时铸造） */
export interface DataSourcePreviewBinding {
  readonly pageId: string;
  readonly pageVersion: number;
  readonly schemaRevision: number;
  readonly generation: number;
}

export interface PreviewDataSourceHostInput {
  /** 读取当前绑定（读时值；null = 未绑定/已失效） */
  readonly getBinding: () => DataSourcePreviewBinding | null;
  /** 当前编辑器 schema 修订号（任何编辑都会 bump → 脏页） */
  readonly getCurrentSchemaRevision: () => number;
  /** 当前页面会话代际（切页/重载递增 → 旧绑定失效） */
  readonly getCurrentGeneration: () => number;
}

function createAbortError(): Error {
  return new DOMException('Aborted', 'AbortError') as unknown as Error;
}

/**
 * 构造预览宿主的 DataSourceHostService（读时值绑定；无重试、无客户端
 * 截止时间——服务端 deadline/字节/深度限额权威；每次 execute 恰好一次 POST）。
 */
export function createPreviewDataSourceHostService(input: PreviewDataSourceHostInput): {
  execute: (
    executeInput: DataSourceHostExecuteInput,
    signal?: AbortSignal,
  ) => Promise<DataSourceExecutionOutcome>;
} {
  const execute = async (
    executeInput: DataSourceHostExecuteInput,
    signal?: AbortSignal,
  ): Promise<DataSourceExecutionOutcome> => {
    // 1. 绑定校验（计划 §3.1）：未保存草稿 / 脏页 / 切页 → fail-close 零 HTTP
    const binding = input.getBinding();
    if (
      !binding ||
      binding.pageVersion == null ||
      input.getCurrentSchemaRevision() !== binding.schemaRevision ||
      input.getCurrentGeneration() !== binding.generation
    ) {
      throw new Error(DATA_SOURCE_BINDING_DIRTY_MESSAGE);
    }

    // 2. 调用前取消检查
    if (signal?.aborted) {
      throw createAbortError();
    }

    // 3. 请求体恰为 {pageVersion[, params]}——绝不携带 pageId/sourceId 进 body
    const requestBody: Record<string, unknown> = { pageVersion: binding.pageVersion };
    if (executeInput.params !== undefined) {
      requestBody.params = executeInput.params;
    }

    let response: Response;
    try {
      response = await fetchApp.request(
        `/api/v1/pages/${encodeURIComponent(binding.pageId)}/data-sources/${encodeURIComponent(
          executeInput.sourceId,
        )}/execute`,
        { method: 'POST', body: requestBody, signal },
      );
    } catch (error) {
      // fetch reject：取消优先于网络失败分类
      if (signal?.aborted) {
        throw createAbortError();
      }
      void error;
      return {
        ok: false,
        code: 'UPSTREAM_FAILURE',
        message: FIXED_NETWORK_MESSAGE,
        traceId: mintLocalDataSourceTraceId(),
      };
    }

    // 4. 读取并解析响应体（期间 abort 保持取消语义，不进映射表）
    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      void error;
      return {
        ok: false,
        code: 'UPSTREAM_FAILURE',
        message: FIXED_NETWORK_MESSAGE,
        traceId: mintLocalDataSourceTraceId(),
      };
    }
    if (signal?.aborted) {
      throw createAbortError();
    }

    let parsedBody: unknown;
    if (bodyText.length > 0) {
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        parsedBody = undefined;
      }
    }

    return mapDataSourceExecuteResponse(response.status, parsedBody);
  };

  return { execute };
}
