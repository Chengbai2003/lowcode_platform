import type { InspectionContext } from './inspector';
import { inspectAndSanitizeJsonValue, pushIssue } from './inspector';
import { describeValue } from './describe';
import { isSafeLogicKey } from '../types/logic';
import type { SchemaValidationLimits } from '../types/limits';
import { isPlainPrototype, safeGet } from '../internal/descriptor';

/**
 * `operationId` 采用可信 Operation 的点分标识形态（如 `demo.items.search`），
 * 每段以字母开头，只允许字母数字；不接受通配、协议、地址或空段。
 */
const OPERATION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;

/**
 * `revision` 是不透明的精确修订标识：字母数字开头，允许 `.`/`_`/`-` 连接符。
 * 模式本身已排除 `*`、`~`、`>`、`<`、`^` 等范围/浮动记号。
 */
const OPERATION_REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const FLOATING_REVISION_TOKENS = new Set(['latest', '*']);

const ALLOWED_DECLARATION_FIELDS = ['operationRef', 'params'] as const;
const ALLOWED_OPERATION_REF_FIELDS = ['operationId', 'revision'] as const;

/** 显式浮动的 revision 记号（`latest` / `*`），精确引用协议一律拒绝。 */
export function isFloatingOperationRevision(value: string): boolean {
  return FLOATING_REVISION_TOKENS.has(value.trim().toLowerCase());
}

function pushSymbolAndAccessorIssues(
  obj: object,
  basePath: readonly (string | number)[],
  inspectionContext: InspectionContext,
): void {
  for (const sym of Object.getOwnPropertySymbols(obj)) {
    pushIssue(inspectionContext, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path: [...basePath, String(sym)],
      message: `Symbol property keys (${String(sym)}) are forbidden`,
    });
  }
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && (desc.get || desc.set)) {
      pushIssue(inspectionContext, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, key],
        message: `Property "${key}" must not be an accessor (getter/setter)`,
      });
    }
  }
}

/**
 * 校验 `logic.dataSources` 声明区域（M1b-1 / ADR-0005）。
 *
 * 声明只允许 `operationRef` 与 `params`：URL、Headers、凭据、风险等级、
 * 超时策略等越界字段一律以 `UNKNOWN_DATASOURCE_FIELD` 拒绝（fail-close）。
 * 参数值复用现有 JsonValue 安全检查（深度/节点/体积预算），`{{ }}` 模板串
 * 保持不透明。返回已声明的具名 key 集合；区域级致命错误时返回 undefined。
 */
export function validateLogicDataSources(
  value: unknown,
  limits: SchemaValidationLimits,
  basePath: readonly (string | number)[],
  inspectionContext: InspectionContext,
): ReadonlySet<string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_DATASOURCES_OBJECT',
      path: [...basePath],
      message: 'PageLogic dataSources must be an object',
    });
    return undefined;
  }

  const dataSourcesObj = value as object;
  if (!isPlainPrototype(dataSourcesObj)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path: [...basePath],
      message: 'PageLogic dataSources must be a plain object',
    });
    return undefined;
  }

  pushSymbolAndAccessorIssues(dataSourcesObj, basePath, inspectionContext);

  const declarationKeys = Object.getOwnPropertyNames(dataSourcesObj);
  // 预算前置检查：声明数超限直接拒绝，绝不进行 O(n) 逐条遍历
  if (declarationKeys.length > limits.maxDataSourceEntries) {
    pushIssue(inspectionContext, {
      code: 'DATASOURCE_ENTRIES_BUDGET_EXCEEDED',
      path: [...basePath],
      message: `DataSource declaration count (${declarationKeys.length}) exceeded limit of ${limits.maxDataSourceEntries}`,
    });
    return undefined;
  }

  const declaredKeys = new Set<string>();
  for (const key of declarationKeys) {
    if (inspectionContext.aborted) break;
    if (!isSafeLogicKey(key)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_DATASOURCE_KEY',
        path: [...basePath, key],
        message: `DataSource key "${key}" must be a safe identifier`,
      });
      continue;
    }
    declaredKeys.add(key);
  }

  for (const key of declarationKeys) {
    if (inspectionContext.aborted) break;
    const declPath: readonly (string | number)[] = [...basePath, key];
    const declRes = safeGet(dataSourcesObj, key);
    const decl = declRes.exists ? declRes.value : undefined;
    if (!decl || typeof decl !== 'object' || Array.isArray(decl)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_DATASOURCE_DECLARATION',
        path: declPath,
        message: `DataSource declaration "${key}" must be an object`,
      });
      continue;
    }

    const declObj = decl as object;
    if (!isPlainPrototype(declObj)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_OBJECT_PROTOTYPE',
        path: declPath,
        message: `DataSource declaration "${key}" must be a plain object`,
      });
      continue;
    }
    pushSymbolAndAccessorIssues(declObj, declPath, inspectionContext);

    for (const field of Object.getOwnPropertyNames(declObj)) {
      if (
        !ALLOWED_DECLARATION_FIELDS.includes(field as (typeof ALLOWED_DECLARATION_FIELDS)[number])
      ) {
        pushIssue(inspectionContext, {
          code: 'UNKNOWN_DATASOURCE_FIELD',
          path: [...declPath, field],
          message: `Unknown field "${field}" on DataSource declaration "${key}" (fail-close)`,
        });
      }
    }

    // operationRef：必填、精确二元组、无浮动 revision
    const refRes = safeGet(declObj, 'operationRef');
    const ref = refRes.exists ? refRes.value : undefined;
    if (!refRes.exists || !ref || typeof ref !== 'object' || Array.isArray(ref)) {
      pushIssue(inspectionContext, {
        code: 'OPERATION_REF_REQUIRED',
        path: [...declPath, 'operationRef'],
        message: `DataSource declaration "${key}" requires an "operationRef" object`,
      });
    } else {
      const refObj = ref as object;
      if (!isPlainPrototype(refObj)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_OBJECT_PROTOTYPE',
          path: [...declPath, 'operationRef'],
          message: `DataSource "${key}" operationRef must be a plain object`,
        });
      } else {
        pushSymbolAndAccessorIssues(refObj, [...declPath, 'operationRef'], inspectionContext);
        for (const field of Object.getOwnPropertyNames(refObj)) {
          if (
            !ALLOWED_OPERATION_REF_FIELDS.includes(
              field as (typeof ALLOWED_OPERATION_REF_FIELDS)[number],
            )
          ) {
            pushIssue(inspectionContext, {
              code: 'UNKNOWN_OPERATION_REF_FIELD',
              path: [...declPath, 'operationRef', field],
              message: `Unknown field "${field}" on operationRef of "${key}" (fail-close)`,
            });
          }
        }

        const operationIdRes = safeGet(refObj, 'operationId');
        const operationId = operationIdRes.exists ? operationIdRes.value : undefined;
        if (
          !operationIdRes.exists ||
          typeof operationId !== 'string' ||
          !OPERATION_ID_PATTERN.test(operationId)
        ) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OPERATION_ID',
            path: [...declPath, 'operationRef', 'operationId'],
            message: `operationId ${describeValue(operationId)} must match dotted identifier pattern (e.g. "demo.items.search")`,
          });
        } else if (operationId.length > limits.maxOperationIdLength) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OPERATION_ID',
            path: [...declPath, 'operationRef', 'operationId'],
            message: `operationId length (${operationId.length}) exceeded limit of ${limits.maxOperationIdLength}`,
          });
        }

        const revisionRes = safeGet(refObj, 'revision');
        const revision = revisionRes.exists ? revisionRes.value : undefined;
        if (!revisionRes.exists || typeof revision !== 'string' || !revision.trim()) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OPERATION_REVISION',
            path: [...declPath, 'operationRef', 'revision'],
            message: `operationRef revision of "${key}" must be a non-empty opaque string`,
          });
        } else if (isFloatingOperationRevision(revision)) {
          pushIssue(inspectionContext, {
            code: 'OPERATION_REVISION_FLOATING',
            path: [...declPath, 'operationRef', 'revision'],
            message: `operationRef revision "${revision}" must be an exact revision; "latest"/wildcard is forbidden`,
          });
        } else if (
          !OPERATION_REVISION_PATTERN.test(revision) ||
          revision.length > limits.maxOperationRevisionLength
        ) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OPERATION_REVISION',
            path: [...declPath, 'operationRef', 'revision'],
            message: `operationRef revision "${revision}" must match the exact-revision pattern within ${limits.maxOperationRevisionLength} chars`,
          });
        }
      }
    }

    // params：可选普通对象；键必须安全；值走共享 JsonValue 安全检查
    const paramsRes = safeGet(declObj, 'params');
    const params = paramsRes.exists ? paramsRes.value : undefined;
    if (paramsRes.exists && params !== undefined) {
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_DATASOURCE_PARAMS',
          path: [...declPath, 'params'],
          message: `DataSource "${key}" params must be an object if provided`,
        });
      } else {
        const paramsObj = params as object;
        const paramKeys = Object.getOwnPropertyNames(paramsObj);
        if (paramKeys.length > limits.maxDataSourceParamEntries) {
          pushIssue(inspectionContext, {
            code: 'DATASOURCE_PARAMS_BUDGET_EXCEEDED',
            path: [...declPath, 'params'],
            message: `DataSource "${key}" param count (${paramKeys.length}) exceeded limit of ${limits.maxDataSourceParamEntries}`,
          });
        } else {
          let paramsClean = true;
          for (const paramKey of paramKeys) {
            if (!isSafeLogicKey(paramKey)) {
              pushIssue(inspectionContext, {
                code: 'INVALID_DATASOURCE_PARAM_KEY',
                path: [...declPath, 'params', paramKey],
                message: `DataSource param key "${paramKey}" must be a safe identifier`,
              });
              paramsClean = false;
            }
          }
          if (paramsClean && inspectionContext.issues.length === 0) {
            inspectAndSanitizeJsonValue(paramsObj, [...declPath, 'params'], 0, inspectionContext);
          }
        }
      }
    }
  }

  return declaredKeys;
}
