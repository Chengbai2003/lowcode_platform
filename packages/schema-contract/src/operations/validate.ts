import type { JsonValue } from '../types/json';
import { isSafeLogicKey } from '../types/logic';
import type { SchemaValidationLimits } from '../types/limits';
import { DEFAULT_SCHEMA_LIMITS } from '../types/limits';
import type { SchemaContractIssue } from '../validation/issues';
import { inspectAndSanitizeJsonValue, pushIssue } from '../validation/inspector';
import { isPlainPrototype, safeGet } from '../internal/descriptor';
import type { DataSourceExecutionRequest } from './types';

export type ValidateDataSourceExecutionRequestResult =
  | { readonly ok: true; readonly value: DataSourceExecutionRequest }
  | { readonly ok: false; readonly issues: readonly SchemaContractIssue[] };

const ALLOWED_REQUEST_FIELDS = ['pageId', 'pageVersion', 'sourceId', 'params'] as const;

/** pageId 只用于定位快照，不做标识符语法约束，但有界防滥用 */
const MAX_PAGE_ID_LENGTH = 256;

function rejectAccessorAndSymbolProperties(
  obj: object,
  basePath: readonly (string | number)[],
  issues: SchemaContractIssue[],
): void {
  const sink = { issues, maxIssues: Infinity, aborted: false };
  for (const sym of Object.getOwnPropertySymbols(obj)) {
    pushIssue(sink, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path: [...basePath, String(sym)],
      message: `Symbol property keys (${String(sym)}) are forbidden`,
    });
  }
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && (desc.get || desc.set)) {
      pushIssue(sink, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, key],
        message: `Property "${key}" must not be an accessor (getter/setter)`,
      });
    }
  }
}

/**
 * 校验宿主执行请求（M1b-1 PR B）。
 *
 * 请求是不可信输入：未知字段 fail-close（携带 URL/凭据/风险等越界字段的
 * 请求天然被拒），`params` 必须是普通对象、键安全且复用共享 JsonValue
 * 深度/节点预算。错误码统一为执行协议的 `INVALID_PARAMS`，不再细分。
 */
export function validateDataSourceExecutionRequest(
  value: unknown,
  limits: SchemaValidationLimits = DEFAULT_SCHEMA_LIMITS,
): ValidateDataSourceExecutionRequestResult {
  const issues: SchemaContractIssue[] = [];
  const sink = { issues, maxIssues: limits.maxIssues, aborted: false };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_PARAMS',
          path: [],
          message: 'DataSource execution request must be a plain object',
        },
      ],
    };
  }

  const requestObj = value as object;
  if (!isPlainPrototype(requestObj)) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_PARAMS',
          path: [],
          message: 'DataSource execution request must be a plain object',
        },
      ],
    };
  }

  rejectAccessorAndSymbolProperties(requestObj, [], issues);

  for (const field of Object.getOwnPropertyNames(requestObj)) {
    if (!ALLOWED_REQUEST_FIELDS.includes(field as (typeof ALLOWED_REQUEST_FIELDS)[number])) {
      pushIssue(sink, {
        code: 'INVALID_PARAMS',
        path: [field],
        message: `Unknown field "${field}" on DataSource execution request (fail-close)`,
      });
    }
  }

  const pageIdRes = safeGet(requestObj, 'pageId');
  const pageId = pageIdRes.exists ? pageIdRes.value : undefined;
  if (!pageIdRes.exists || typeof pageId !== 'string' || !pageId.trim()) {
    pushIssue(sink, {
      code: 'INVALID_PARAMS',
      path: ['pageId'],
      message: 'DataSource execution request requires a non-empty string "pageId"',
    });
  } else if (pageId.length > MAX_PAGE_ID_LENGTH) {
    pushIssue(sink, {
      code: 'INVALID_PARAMS',
      path: ['pageId'],
      message: `pageId length (${pageId.length}) exceeded limit of ${MAX_PAGE_ID_LENGTH}`,
    });
  }

  const pageVersionRes = safeGet(requestObj, 'pageVersion');
  const pageVersion = pageVersionRes.exists ? pageVersionRes.value : undefined;
  if (
    !pageVersionRes.exists ||
    typeof pageVersion !== 'number' ||
    !Number.isSafeInteger(pageVersion) ||
    pageVersion < 1
  ) {
    pushIssue(sink, {
      code: 'INVALID_PARAMS',
      path: ['pageVersion'],
      message: 'DataSource execution request requires "pageVersion" to be a positive integer',
    });
  }

  const sourceIdRes = safeGet(requestObj, 'sourceId');
  const sourceId = sourceIdRes.exists ? sourceIdRes.value : undefined;
  if (!sourceIdRes.exists || typeof sourceId !== 'string' || !isSafeLogicKey(sourceId)) {
    pushIssue(sink, {
      code: 'INVALID_PARAMS',
      path: ['sourceId'],
      message: 'DataSource execution request requires "sourceId" to be a safe identifier',
    });
  }

  const paramsRes = safeGet(requestObj, 'params');
  const params = paramsRes.exists ? paramsRes.value : undefined;
  let sanitizedParams: Record<string, JsonValue> | undefined;
  if (paramsRes.exists && params !== undefined) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      pushIssue(sink, {
        code: 'INVALID_PARAMS',
        path: ['params'],
        message: 'DataSource execution request "params" must be an object if provided',
      });
    } else if (!isPlainPrototype(params as object)) {
      pushIssue(sink, {
        code: 'INVALID_PARAMS',
        path: ['params'],
        message: 'DataSource execution request "params" must be a plain object',
      });
    } else {
      const paramsObj = params as object;
      rejectAccessorAndSymbolProperties(paramsObj, ['params'], issues);
      const paramKeys = Object.getOwnPropertyNames(paramsObj);
      if (paramKeys.length > limits.maxDataSourceParamEntries) {
        pushIssue(sink, {
          code: 'INVALID_PARAMS',
          path: ['params'],
          message: `DataSource execution request param count (${paramKeys.length}) exceeded limit of ${limits.maxDataSourceParamEntries}`,
        });
      } else {
        let keysClean = true;
        for (const paramKey of paramKeys) {
          if (!isSafeLogicKey(paramKey)) {
            pushIssue(sink, {
              code: 'INVALID_PARAMS',
              path: ['params', paramKey],
              message: `DataSource execution request param key "${paramKey}" must be a safe identifier`,
            });
            keysClean = false;
          }
        }
        if (keysClean) {
          const sanitized = inspectAndSanitizeJsonValue(paramsObj, ['params'], 0, {
            ...sink,
            seen: new Set<object>(),
            maxDepth: limits.maxDepth,
            maxNodes: limits.maxJsonNodes,
            nodeCount: 0,
            nodeBudgetReported: false,
          });
          if (sanitized !== undefined && !sink.aborted) {
            sanitizedParams = sanitized as Record<string, JsonValue>;
          }
        }
      }
    }
  }

  if (issues.length > 0 || sink.aborted) {
    return { ok: false, issues };
  }

  const request: DataSourceExecutionRequest = sanitizedParams
    ? {
        pageId: pageId as string,
        pageVersion: pageVersion as number,
        sourceId: sourceId as string,
        params: sanitizedParams,
      }
    : {
        pageId: pageId as string,
        pageVersion: pageVersion as number,
        sourceId: sourceId as string,
      };
  return { ok: true, value: request };
}
