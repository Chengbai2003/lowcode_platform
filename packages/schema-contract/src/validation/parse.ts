import { isSupportedSchemaVersion } from '../types/versions';
import type { PageSchema } from '../types/schema';
import { isSafeLogicKey, type ComputedExpression, type PageLogic } from '../types/logic';
import { analyzeComputedDeclarations, type ComputedLogicAnalysis } from '../computed';
import { analyzeActionFlowDeclarations, type ActionFlowAnalysis } from '../action-flow';
import type { ComponentNode } from '../types/node';
import type { JsonValue } from '../types/json';
import type { SchemaValidationLimits } from '../types/limits';
import { normalizeValidationLimits } from '../types/limits';
import type { ParsePageSchemaResult, SchemaContractIssue } from './issues';
import { validateComponentGraph } from './tree';
import { validateActionList, type ActionValidationContext } from './actions';
import type { InspectionContext, IssueSink } from './inspector';
import { inspectAndSanitizeJsonValue, pushIssue } from './inspector';
import { describeValue } from './describe';

const ALLOWED_SCHEMA_KEYS = new Set(['schemaVersion', 'rootId', 'components', 'logic']);
const ALLOWED_COMPONENT_KEYS = new Set(['id', 'type', 'props', 'childrenIds', 'events']);
const ALLOWED_LOGIC_KEYS = new Set(['states', 'computed', 'flows']);

const hasOwn = (target: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

function isPlainPrototype(obj: object): boolean {
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

function pushSymbolIssue(obj: object, path: readonly (string | number)[], sink: IssueSink): void {
  const symbols = Object.getOwnPropertySymbols(obj);
  if (symbols.length > 0) {
    pushIssue(sink, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path: [...path],
      message: `Symbol property keys (${symbols.map(String).join(', ')}) are forbidden`,
    });
  }
}

function pushAccessorIssues(
  obj: object,
  basePath: readonly (string | number)[],
  sink: IssueSink,
): boolean {
  let hasAccessor = false;
  const names = Object.getOwnPropertyNames(obj);
  for (const key of names) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc) continue;
    if (desc.get || desc.set) {
      pushIssue(sink, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, key],
        message: `Property "${key}" must not be an accessor (getter/setter)`,
      });
      hasAccessor = true;
    }
  }
  // also need to check symbol descriptors for accessor? symbols already flagged as forbidden, but still check
  const symbols = Object.getOwnPropertySymbols(obj);
  for (const sym of symbols) {
    const desc = Object.getOwnPropertyDescriptor(obj, sym);
    if (desc && (desc.get || desc.set)) {
      pushIssue(sink, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, String(sym)],
        message: `Symbol property "${String(sym)}" must not be an accessor`,
      });
      hasAccessor = true;
    }
  }
  return hasAccessor;
}

function safeGetValue(
  obj: object,
  key: string,
): { exists: boolean; isAccessor: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return { exists: false, isAccessor: false, value: undefined };
  if (desc.get || desc.set) return { exists: true, isAccessor: true, value: undefined };
  return { exists: true, isAccessor: false, value: (desc as PropertyDescriptor).value };
}

/**
 * 经 data descriptor 读取数组 length；length 缺失或为访问器时返回 null（由调用方的
 * per-item 检查负责报错，此时不会发生 O(len) 遍历）。
 */
function arrayLengthViaDescriptor(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const desc = Object.getOwnPropertyDescriptor(value as object, 'length');
  if (!desc || desc.get || desc.set || !('value' in desc) || typeof desc.value !== 'number') {
    return null;
  }
  return desc.value;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  const propNames = Object.getOwnPropertyNames(obj);
  for (const key of propNames) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && 'value' in desc) {
      const val = desc.value;
      if (val !== null && typeof val === 'object') {
        deepFreeze(val);
      }
    }
  }
  // also freeze symbol props if any (should not exist for frozen canonical)
  const symbols = Object.getOwnPropertySymbols(obj);
  for (const sym of symbols) {
    const desc = Object.getOwnPropertyDescriptor(obj, sym);
    if (desc && 'value' in desc && desc.value !== null && typeof desc.value === 'object') {
      deepFreeze(desc.value);
    }
  }
  return obj;
}

/**
 * 安全解析 JSON 字符串为 PageSchema，先行检查 UTF-8 字节预算
 */
export function parsePageSchemaJson(
  rawJson: string,
  customLimits?: Partial<SchemaValidationLimits>,
): ParsePageSchemaResult {
  const limits = normalizeValidationLimits(customLimits);

  if (typeof rawJson !== 'string') {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_JSON_INPUT',
          path: [],
          message: 'Input must be a JSON string',
        },
      ],
    };
  }

  // 环境无关的 UTF-8 字节计算 (兼容浏览器与 Node.js，不依赖 Node Buffer)
  const byteLength = new TextEncoder().encode(rawJson).length;
  if (byteLength > limits.maxBytes) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_SIZE_EXCEEDED',
          path: [],
          message: `Schema size (${byteLength} bytes) exceeds limit of ${limits.maxBytes} bytes (1 MiB baseline)`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          code: 'JSON_PARSE_ERROR',
          path: [],
          message: err instanceof Error ? err.message : 'Malformed JSON',
        },
      ],
    };
  }

  return validatePageSchemaValue(parsed, limits);
}

/**
 * 严格校验未知输入是否为合法、安全的 PageSchema 数据结构
 * 全链路 descriptor-safe，绝不触发任何 getter。
 *
 * 全局 IssueSink 从函数顶部创建：本函数内所有 issue 一律经 pushIssue(sink, ...)
 * 收录（受 maxIssues 严格封顶并联动 abort 短路），禁止直接 issues.push()；
 * 拓扑校验 (tree.ts) 与 Action 校验 (actions.ts) 共享同一 Sink。
 */
export function validatePageSchemaValue(
  input: unknown,
  customLimits?: Partial<SchemaValidationLimits>,
): ParsePageSchemaResult {
  const limits = normalizeValidationLimits(customLimits);
  const issues: SchemaContractIssue[] = [];

  // 全局 Sink：覆盖顶层字段、组件、events、childrenIds、拓扑与 canonical 重建全部阶段
  const inspectionContext: InspectionContext = {
    issues,
    seen: new Set<object>(),
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxJsonNodes,
    maxIssues: limits.maxIssues,
    nodeCount: 0,
    nodeBudgetReported: false,
    aborted: false,
  };

  const actionValidationContext: ActionValidationContext = {
    issues,
    inspectionContext,
    maxActionNodes: limits.maxActionNodes,
    maxActionDepth: limits.maxActionDepth,
    allowLegacyNestedStateTargets: true,
    actionCount: 0,
    actionBudgetReported: false,
  };

  // 热循环统一短路：任一预算耗尽（含 issue 封顶触发）时立即终止遍历
  const budgetStop = (): boolean => inspectionContext.aborted;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_SCHEMA_OBJECT',
      path: [],
      message: 'PageSchema must be an object',
    });
    return { ok: false, issues };
  }

  const schemaObj = input as object;

  // 0. 原型校验：必须是普通对象或 null 原型
  if (!isPlainPrototype(schemaObj)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path: [],
      message: 'PageSchema must be a plain object (Object.prototype or null)',
    });
    return { ok: false, issues };
  }

  // Symbol 属性一律拒绝
  pushSymbolIssue(schemaObj, [], inspectionContext);

  // 访问器检查
  pushAccessorIssues(schemaObj, [], inspectionContext);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // 2. Fail-close 校验 Schema 顶层未知字段（使用 getOwnPropertyNames 覆盖不可枚举）
  for (const key of Object.getOwnPropertyNames(schemaObj)) {
    if (budgetStop()) break;
    if (!ALLOWED_SCHEMA_KEYS.has(key)) {
      pushIssue(inspectionContext, {
        code: 'UNKNOWN_SCHEMA_FIELD',
        path: [key],
        message: `Unknown top-level field "${key}" on PageSchema (fail-close)`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // 3. schemaVersion / rootId / components / logic 读取必须走 descriptor
  const schemaVersionRes = safeGetValue(schemaObj, 'schemaVersion');
  const rootIdRes = safeGetValue(schemaObj, 'rootId');
  const componentsRes = safeGetValue(schemaObj, 'components');
  const logicRes = safeGetValue(schemaObj, 'logic');

  const schemaVersion = schemaVersionRes.exists ? schemaVersionRes.value : undefined;
  const rootId = rootIdRes.exists ? rootIdRes.value : undefined;
  const components = componentsRes.exists ? componentsRes.value : undefined;
  const logic = logicRes.exists ? logicRes.value : undefined;

  // schemaVersion 校验
  if (schemaVersion === undefined) {
    pushIssue(inspectionContext, {
      code: 'SCHEMA_VERSION_REQUIRED',
      path: ['schemaVersion'],
      message: 'schemaVersion is required on PageSchema',
    });
  } else if (!isSupportedSchemaVersion(schemaVersion)) {
    pushIssue(inspectionContext, {
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: ['schemaVersion'],
      message: `Unsupported schemaVersion: ${describeValue(schemaVersion)}`,
    });
  }

  // rootId 校验（注意：rootId 可能是通过 descriptor 读取的，避免触发继承 getter）
  if (typeof rootId !== 'string' || !rootId.trim()) {
    pushIssue(inspectionContext, {
      code: 'ROOT_ID_REQUIRED',
      path: ['rootId'],
      message: 'Schema rootId is required and must be a non-empty string',
    });
  }

  // components 校验
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    pushIssue(inspectionContext, {
      code: 'COMPONENTS_OBJECT_REQUIRED',
      path: ['components'],
      message: 'Schema components must be an object',
    });
    return { ok: false, issues };
  }

  const componentsObj = components as object;

  if (!isPlainPrototype(componentsObj)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path: ['components'],
      message: 'Schema components must be a plain object',
    });
    return { ok: false, issues };
  }

  pushSymbolIssue(componentsObj, ['components'], inspectionContext);
  pushAccessorIssues(componentsObj, ['components'], inspectionContext);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  let logicObj: object | undefined;
  let statesObj: object | undefined;
  let computedObj: object | undefined;
  let computedAnalysis: ComputedLogicAnalysis | undefined;
  let flowsAnalysis: ActionFlowAnalysis | undefined;

  if (logicRes.exists && logic !== undefined) {
    if (!logic || typeof logic !== 'object' || Array.isArray(logic)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_LOGIC_OBJECT',
        path: ['logic'],
        message: 'Schema logic must be an object',
      });
    } else {
      logicObj = logic as object;
      if (!isPlainPrototype(logicObj)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_OBJECT_PROTOTYPE',
          path: ['logic'],
          message: 'Schema logic must be a plain object',
        });
      } else {
        pushSymbolIssue(logicObj, ['logic'], inspectionContext);
        const hasLogicAccessor = pushAccessorIssues(logicObj, ['logic'], inspectionContext);

        for (const key of Object.getOwnPropertyNames(logicObj)) {
          if (budgetStop()) break;
          if (!ALLOWED_LOGIC_KEYS.has(key)) {
            pushIssue(inspectionContext, {
              code: 'UNKNOWN_LOGIC_FIELD',
              path: ['logic', key],
              message: `Unknown field "${key}" on PageLogic (fail-close)`,
            });
          }
        }

        if (!hasLogicAccessor) {
          const statesRes = safeGetValue(logicObj, 'states');
          const states = statesRes.exists ? statesRes.value : undefined;
          const computedRes = safeGetValue(logicObj, 'computed');
          const computed = computedRes.exists ? computedRes.value : undefined;
          if (statesRes.exists && states !== undefined) {
            if (!states || typeof states !== 'object' || Array.isArray(states)) {
              pushIssue(inspectionContext, {
                code: 'INVALID_STATES_OBJECT',
                path: ['logic', 'states'],
                message: 'PageLogic states must be an object',
              });
            } else {
              statesObj = states as object;
              if (!isPlainPrototype(statesObj)) {
                pushIssue(inspectionContext, {
                  code: 'INVALID_OBJECT_PROTOTYPE',
                  path: ['logic', 'states'],
                  message: 'PageLogic states must be a plain object',
                });
              } else {
                pushSymbolIssue(statesObj, ['logic', 'states'], inspectionContext);
                const hasStatesAccessor = pushAccessorIssues(
                  statesObj,
                  ['logic', 'states'],
                  inspectionContext,
                );
                const stateKeys = Object.getOwnPropertyNames(statesObj);

                if (stateKeys.length > limits.maxStateEntries) {
                  pushIssue(inspectionContext, {
                    code: 'STATE_ENTRIES_BUDGET_EXCEEDED',
                    path: ['logic', 'states'],
                    message: `State entry count (${stateKeys.length}) exceeded limit of ${limits.maxStateEntries}`,
                  });
                } else {
                  for (const stateKey of stateKeys) {
                    if (budgetStop()) break;
                    if (!isSafeLogicKey(stateKey)) {
                      pushIssue(inspectionContext, {
                        code: 'INVALID_STATE_KEY',
                        path: ['logic', 'states', stateKey],
                        message: `State key "${stateKey}" must be a safe identifier`,
                      });
                    }
                  }
                }

                if (!hasStatesAccessor && issues.length === 0) {
                  inspectAndSanitizeJsonValue(statesObj, ['logic', 'states'], 0, inspectionContext);
                }
              }
            }
          }

          if (computedRes.exists && computed !== undefined) {
            if (!computed || typeof computed !== 'object' || Array.isArray(computed)) {
              pushIssue(inspectionContext, {
                code: 'INVALID_COMPUTED_OBJECT',
                path: ['logic', 'computed'],
                message: 'PageLogic computed must be an object',
              });
            } else {
              computedObj = computed as object;
              if (!isPlainPrototype(computedObj)) {
                pushIssue(inspectionContext, {
                  code: 'INVALID_OBJECT_PROTOTYPE',
                  path: ['logic', 'computed'],
                  message: 'PageLogic computed must be a plain object',
                });
              } else {
                pushSymbolIssue(computedObj, ['logic', 'computed'], inspectionContext);
                const hasComputedAccessor = pushAccessorIssues(
                  computedObj,
                  ['logic', 'computed'],
                  inspectionContext,
                );
                const computedKeys = Object.getOwnPropertyNames(computedObj);

                if (computedKeys.length > limits.maxComputedEntries) {
                  pushIssue(inspectionContext, {
                    code: 'COMPUTED_ENTRIES_BUDGET_EXCEEDED',
                    path: ['logic', 'computed'],
                    message: `Computed entry count (${computedKeys.length}) exceeded limit of ${limits.maxComputedEntries}`,
                  });
                } else if (!hasComputedAccessor) {
                  for (const computedKey of computedKeys) {
                    if (budgetStop()) break;
                    if (!isSafeLogicKey(computedKey)) {
                      pushIssue(inspectionContext, {
                        code: 'INVALID_COMPUTED_KEY',
                        path: ['logic', 'computed', computedKey],
                        message: `Computed key "${computedKey}" must be a safe identifier`,
                      });
                      continue;
                    }
                    const expressionRes = safeGetValue(computedObj, computedKey);
                    if (
                      !expressionRes.exists ||
                      typeof expressionRes.value !== 'string' ||
                      expressionRes.value.trim().length === 0
                    ) {
                      pushIssue(inspectionContext, {
                        code: 'COMPUTED_EXPRESSION_REQUIRED',
                        path: ['logic', 'computed', computedKey],
                        message: 'Computed declaration must be a non-empty expression string',
                      });
                    }
                  }
                  if (issues.length === 0) {
                    // Computed 仍是 Schema JSON 的一部分：对象和每条表达式都计入共享节点预算。
                    inspectAndSanitizeJsonValue(
                      computedObj,
                      ['logic', 'computed'],
                      0,
                      inspectionContext,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues };
  }

  const computedResult = analyzeComputedDeclarations(
    {
      ...(statesObj ? { states: statesObj as Readonly<Record<string, JsonValue>> } : {}),
      ...(computedObj
        ? { computed: computedObj as Readonly<Record<string, ComputedExpression>> }
        : {}),
    },
    limits,
  );
  if (!computedResult.ok) {
    for (const computedIssue of computedResult.issues) {
      pushIssue(inspectionContext, computedIssue);
      if (inspectionContext.aborted) break;
    }
  } else {
    computedAnalysis = computedResult.value;
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues };
  }

  if (logicObj) {
    const flowsRes = safeGetValue(logicObj, 'flows');
    const flows = flowsRes.exists ? flowsRes.value : undefined;
    if (flowsRes.exists && flows !== undefined) {
      const flowsResult = analyzeActionFlowDeclarations(flows, limits, ['logic', 'flows'], {
        allowLegacyNestedStateTargets: statesObj === undefined,
      });
      if (!flowsResult.ok) {
        for (const flowIssue of flowsResult.issues) {
          pushIssue(inspectionContext, flowIssue);
          if (inspectionContext.aborted) break;
        }
      } else {
        flowsAnalysis = flowsResult.value;
      }
    }
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues };
  }

  actionValidationContext.allowLegacyNestedStateTargets = statesObj === undefined;
  const declaredFlowKeys = new Set<string>(flowsAnalysis ? Object.keys(flowsAnalysis.flows) : []);
  actionValidationContext.flowValidation = {
    declaredFlowKeys,
  };

  const componentKeys = Object.getOwnPropertyNames(componentsObj);

  if (componentKeys.length > limits.maxComponents) {
    // 预算前置检查：组件超限立即失败返回，绝不继续遍历组件
    pushIssue(inspectionContext, {
      code: 'COMPONENT_BUDGET_EXCEEDED',
      path: ['components'],
      message: `Component count (${componentKeys.length}) exceeded limit of ${limits.maxComponents}`,
    });
    return { ok: false, issues };
  }

  if (typeof rootId === 'string' && rootId.trim() && !hasOwn(componentsObj, rootId)) {
    pushIssue(inspectionContext, {
      code: 'ROOT_NODE_MISSING',
      path: ['components', rootId],
      message: `Schema rootId "${rootId}" does not exist in components`,
    });
  }

  // 逐个校验组件
  for (const componentId of componentKeys) {
    if (budgetStop()) break;
    const compPath: readonly (string | number)[] = ['components', componentId];

    const compDesc = Object.getOwnPropertyDescriptor(componentsObj, componentId);
    if (!compDesc || !('value' in compDesc)) {
      // sparse or accessor already flagged
      continue;
    }
    if (compDesc.get || compDesc.set) {
      // already flagged above, but double check
      continue;
    }
    const component = compDesc.value;

    if (!component || typeof component !== 'object' || Array.isArray(component)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_COMPONENT_OBJECT',
        path: compPath,
        message: `Component "${componentId}" must be an object`,
      });
      continue;
    }

    const compObj = component as object;

    if (!isPlainPrototype(compObj)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_OBJECT_PROTOTYPE',
        path: compPath,
        message: `Component "${componentId}" must be a plain object`,
      });
      continue;
    }

    pushSymbolIssue(compObj, compPath, inspectionContext);
    const hasCompAccessor = pushAccessorIssues(compObj, compPath, inspectionContext);
    if (hasCompAccessor) continue;

    // Fail-close 校验 ComponentNode 未知字段（覆盖不可枚举 + Symbol）
    for (const key of Object.getOwnPropertyNames(compObj)) {
      if (budgetStop()) break;
      if (!ALLOWED_COMPONENT_KEYS.has(key)) {
        pushIssue(inspectionContext, {
          code: 'UNKNOWN_COMPONENT_FIELD',
          path: [...compPath, key],
          message: `Unknown field "${key}" on ComponentNode "${componentId}" (fail-close)`,
        });
      }
    }

    const typeRes = safeGetValue(compObj, 'type');
    const idRes = safeGetValue(compObj, 'id');
    const propsRes = safeGetValue(compObj, 'props');
    const childrenIdsRes = safeGetValue(compObj, 'childrenIds');
    const eventsRes = safeGetValue(compObj, 'events');

    const typeVal = typeRes.exists ? typeRes.value : undefined;
    const idVal = idRes.exists ? idRes.value : undefined;
    const propsVal = propsRes.exists ? propsRes.value : undefined;
    const childrenIdsVal = childrenIdsRes.exists ? childrenIdsRes.value : undefined;
    const eventsVal = eventsRes.exists ? eventsRes.value : undefined;

    if (typeof typeVal !== 'string' || !typeVal.trim()) {
      pushIssue(inspectionContext, {
        code: 'COMPONENT_TYPE_REQUIRED',
        path: [...compPath, 'type'],
        message: `Component "${componentId}" type is required`,
      });
    }

    if (typeof idVal !== 'string' || !idVal.trim()) {
      pushIssue(inspectionContext, {
        code: 'COMPONENT_ID_REQUIRED',
        path: [...compPath, 'id'],
        message: `Component "${componentId}" id is required`,
      });
    } else if (idVal !== componentId) {
      pushIssue(inspectionContext, {
        code: 'COMPONENT_ID_MISMATCH',
        path: [...compPath, 'id'],
        message: `Component id "${describeValue(idVal)}" must match its key "${componentId}"`,
      });
    }

    if (propsRes.exists && propsVal !== undefined) {
      if (!propsVal || typeof propsVal !== 'object' || Array.isArray(propsVal)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_PROPS_OBJECT',
          path: [...compPath, 'props'],
          message: `Component "${componentId}" props must be an object`,
        });
      } else {
        inspectAndSanitizeJsonValue(propsVal, [...compPath, 'props'], 0, inspectionContext);
      }
    }

    if (childrenIdsRes.exists && childrenIdsVal !== undefined) {
      if (!Array.isArray(childrenIdsVal)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_CHILDREN_IDS',
          path: [...compPath, 'childrenIds'],
          message: `Component "${componentId}" childrenIds must be an array`,
        });
      } else {
        const arrObj = childrenIdsVal as unknown[];
        // array prototype & Symbol & non-index check
        const arrProto = Object.getPrototypeOf(arrObj);
        const childrenLen = arrayLengthViaDescriptor(childrenIdsVal);
        if (arrProto !== Array.prototype) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OBJECT_PROTOTYPE',
            path: [...compPath, 'childrenIds'],
            message: `Component "${componentId}" childrenIds must be a plain array`,
          });
        } else if (childrenLen !== null && childrenLen > limits.maxComponents) {
          // 预算前置检查：childrenIds 长度不可能超过组件数上限，超限直接拒绝，绝不进行 O(len) 遍历
          pushIssue(inspectionContext, {
            code: 'CHILDREN_IDS_BUDGET_EXCEEDED',
            path: [...compPath, 'childrenIds'],
            message: `childrenIds length (${childrenLen}) exceeded limit of ${limits.maxComponents}`,
          });
        } else {
          const arrSymbols = Object.getOwnPropertySymbols(arrObj);
          if (arrSymbols.length > 0) {
            pushIssue(inspectionContext, {
              code: 'SYMBOL_PROPERTY_FORBIDDEN',
              path: [...compPath, 'childrenIds'],
              message: `Symbol property keys are forbidden in childrenIds`,
            });
          }
          const arrNames = Object.getOwnPropertyNames(arrObj);
          for (const key of arrNames) {
            if (key === 'length') continue;
            const num = Number(key);
            const isIndex =
              String(num) === key && Number.isInteger(num) && num >= 0 && num < 4294967295;
            if (!isIndex) {
              pushIssue(inspectionContext, {
                code: 'UNKNOWN_ARRAY_FIELD',
                path: [...compPath, 'childrenIds', key],
                message: `childrenIds property "${key}" is forbidden (non-index)`,
              });
            }
          }
          // length accessor check
          const lenDesc = Object.getOwnPropertyDescriptor(arrObj, 'length');
          if (lenDesc && (lenDesc.get || lenDesc.set)) {
            pushIssue(inspectionContext, {
              code: 'ACCESSOR_PROPERTY_FORBIDDEN',
              path: [...compPath, 'childrenIds', 'length'],
              message: `childrenIds length must not be an accessor`,
            });
          } else {
            let len = 0;
            if (lenDesc && 'value' in lenDesc && typeof lenDesc.value === 'number')
              len = lenDesc.value;
            const seenChildIds = new Set<string>();
            for (let idx = 0; idx < len; idx++) {
              if (budgetStop()) break;
              const itemDesc = Object.getOwnPropertyDescriptor(arrObj, String(idx));
              if (!itemDesc) {
                pushIssue(inspectionContext, {
                  code: 'SPARSE_ARRAY_FORBIDDEN',
                  path: [...compPath, 'childrenIds', idx],
                  message: 'Sparse arrays are forbidden in childrenIds',
                });
                continue;
              }
              if (itemDesc.get || itemDesc.set) {
                pushIssue(inspectionContext, {
                  code: 'ACCESSOR_PROPERTY_FORBIDDEN',
                  path: [...compPath, 'childrenIds', idx],
                  message: `childrenIds index "${idx}" must not be an accessor`,
                });
                continue;
              }
              if (!('value' in itemDesc)) continue;
              const childId = itemDesc.value;
              if (typeof childId !== 'string' || !hasOwn(componentsObj, childId)) {
                pushIssue(inspectionContext, {
                  code: 'MISSING_CHILD_REFERENCE',
                  path: [...compPath, 'childrenIds', idx],
                  message: `Component "${componentId}" references missing child "${describeValue(childId)}"`,
                });
              }
              if (typeof childId === 'string') {
                if (seenChildIds.has(childId)) {
                  pushIssue(inspectionContext, {
                    code: 'DUPLICATE_CHILD_REFERENCE',
                    path: [...compPath, 'childrenIds', idx],
                    message: `Component "${componentId}" references child "${childId}" more than once`,
                  });
                }
                seenChildIds.add(childId);
              }
            }
          }
        }
      }
    }

    if (eventsRes.exists && eventsVal !== undefined) {
      if (!eventsVal || typeof eventsVal !== 'object' || Array.isArray(eventsVal)) {
        pushIssue(inspectionContext, {
          code: 'INVALID_EVENTS_OBJECT',
          path: [...compPath, 'events'],
          message: `Component "${componentId}" events must be an object`,
        });
      } else {
        const eventsObj = eventsVal as object;
        if (!isPlainPrototype(eventsObj)) {
          pushIssue(inspectionContext, {
            code: 'INVALID_OBJECT_PROTOTYPE',
            path: [...compPath, 'events'],
            message: `Component "${componentId}" events must be a plain object`,
          });
        } else {
          pushSymbolIssue(eventsObj, [...compPath, 'events'], inspectionContext);
          const eventNames = Object.getOwnPropertyNames(eventsObj);
          // 预算前置检查：事件绑定数量超过 maxEventBindings 时直接拒绝，
          // 绝不进行 O(n) 遍历（空 ActionList 不消耗 action/JSON 节点预算，必须独立受限）
          if (eventNames.length > limits.maxEventBindings) {
            pushIssue(inspectionContext, {
              code: 'EVENT_BINDINGS_BUDGET_EXCEEDED',
              path: [...compPath, 'events'],
              message: `Event bindings count (${eventNames.length}) exceeded limit of ${limits.maxEventBindings}`,
            });
          } else {
            for (const eventName of eventNames) {
              if (budgetStop()) break;
              const evDesc = Object.getOwnPropertyDescriptor(eventsObj, eventName);
              if (!evDesc) continue;
              if (evDesc.get || evDesc.set) {
                pushIssue(inspectionContext, {
                  code: 'ACCESSOR_PROPERTY_FORBIDDEN',
                  path: [...compPath, 'events', eventName],
                  message: `Event "${eventName}" must not be an accessor`,
                });
                continue;
              }
              if ('value' in evDesc) {
                validateActionList(
                  evDesc.value,
                  [...compPath, 'events', eventName],
                  0,
                  actionValidationContext,
                );
              }
            }
          }
        }
      }
    }
  }

  // 6. 组件拓扑图合法性校验 (成环、多父、严格孤儿节点)
  // 只有在前面积累的 issues 为空且未触发预算 abort 时才进行拓扑校验，避免误报
  if (
    typeof rootId === 'string' &&
    rootId.trim() &&
    issues.length === 0 &&
    !inspectionContext.aborted
  ) {
    // 构建一个 descriptor-safe 的纯净 components 视图供 tree 校验，避免 tree 内部触发 getter
    const safeComponentsView: Record<string, ComponentNode> = Object.create(null);
    for (const cid of Object.getOwnPropertyNames(componentsObj)) {
      const cDesc = Object.getOwnPropertyDescriptor(componentsObj, cid);
      if (!cDesc || !('value' in cDesc) || cDesc.get || cDesc.set) continue;
      const cVal = cDesc.value as object;
      const childrenIdsDesc = Object.getOwnPropertyDescriptor(cVal, 'childrenIds');
      let childrenIdsCopy: string[] | undefined;
      if (childrenIdsDesc && 'value' in childrenIdsDesc && Array.isArray(childrenIdsDesc.value)) {
        const arr = childrenIdsDesc.value as unknown[];
        const lenDesc = Object.getOwnPropertyDescriptor(arr, 'length');
        const len =
          lenDesc && 'value' in lenDesc && typeof lenDesc.value === 'number'
            ? (lenDesc.value as number)
            : 0;
        const copy: string[] = [];
        for (let i = 0; i < len; i++) {
          const d = Object.getOwnPropertyDescriptor(arr, String(i));
          if (d && 'value' in d && typeof d.value === 'string') copy.push(d.value);
        }
        childrenIdsCopy = copy;
      }
      // Use defineProperty to keep __proto__ safe
      const nodeForTree: any = Object.create(null);
      const typeDesc = Object.getOwnPropertyDescriptor(cVal, 'type');
      const idDesc = Object.getOwnPropertyDescriptor(cVal, 'id');
      Object.defineProperty(nodeForTree, 'id', {
        value: idDesc && 'value' in idDesc ? idDesc.value : undefined,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(nodeForTree, 'type', {
        value: typeDesc && 'value' in typeDesc ? typeDesc.value : undefined,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      if (childrenIdsCopy !== undefined) {
        Object.defineProperty(nodeForTree, 'childrenIds', {
          value: childrenIdsCopy,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      Object.defineProperty(safeComponentsView, cid, {
        value: nodeForTree as ComponentNode,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    validateComponentGraph(
      rootId,
      safeComponentsView as Record<string, ComponentNode>,
      inspectionContext,
    );
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues };
  }

  // 成功分支：构建 canonical、深冻结 的新对象，彻底消除 TOCTOU
  // 使用 descriptor-safe 读取重新构建，避免直接使用原始可变对象
  const cleanComponents: Record<string, ComponentNode> = Object.create(null);
  // 为 canonical 构建创建独立的 inspectionContext（同一 issues 数组），若 sanitization
  // 发现新问题则经 pushIssue 收录并 fail-close
  const canonicalInspectionContext: InspectionContext = {
    issues,
    seen: new Set<object>(),
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxJsonNodes,
    maxIssues: limits.maxIssues,
    nodeCount: 0,
    nodeBudgetReported: false,
    aborted: false,
  };

  let cleanLogic: PageLogic | undefined;
  if (logicObj) {
    const cleanLogicObject: Record<string, unknown> = Object.create(null);
    if (statesObj) {
      const cleanStates = inspectAndSanitizeJsonValue(
        statesObj,
        ['logic', 'states'],
        0,
        canonicalInspectionContext,
      );
      if (cleanStates !== undefined) {
        Object.defineProperty(cleanLogicObject, 'states', {
          value: cleanStates,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    if (computedObj && computedAnalysis) {
      const cleanComputed: Record<string, ComputedExpression> = Object.create(null);
      const expressionsByKey = new Map(
        computedAnalysis.nodes.map((node) => [node.key, node.expression]),
      );
      for (const computedKey of Object.getOwnPropertyNames(computedObj).sort()) {
        const expression = expressionsByKey.get(computedKey);
        if (expression === undefined) continue;
        Object.defineProperty(cleanComputed, computedKey, {
          value: expression,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      Object.defineProperty(cleanLogicObject, 'computed', {
        value: cleanComputed,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (flowsAnalysis) {
      Object.defineProperty(cleanLogicObject, 'flows', {
        value: flowsAnalysis.flows,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    cleanLogic = cleanLogicObject as PageLogic;
  }

  for (const cid of Object.getOwnPropertyNames(componentsObj)) {
    const cDesc = Object.getOwnPropertyDescriptor(componentsObj, cid);
    if (!cDesc || !('value' in cDesc)) continue;
    const comp = cDesc.value as object;
    const idDesc = Object.getOwnPropertyDescriptor(comp, 'id');
    const typeDesc = Object.getOwnPropertyDescriptor(comp, 'type');
    const propsDesc = Object.getOwnPropertyDescriptor(comp, 'props');
    const childrenIdsDesc = Object.getOwnPropertyDescriptor(comp, 'childrenIds');
    const eventsDesc = Object.getOwnPropertyDescriptor(comp, 'events');

    const idVal = idDesc && 'value' in idDesc ? (idDesc.value as string) : undefined;
    const typeVal = typeDesc && 'value' in typeDesc ? (typeDesc.value as string) : undefined;
    if (typeof idVal !== 'string' || typeof typeVal !== 'string') continue;

    let cleanProps: Record<string, unknown> | undefined;
    if (propsDesc && 'value' in propsDesc && propsDesc.value !== undefined) {
      const sanitized = inspectAndSanitizeJsonValue(
        propsDesc.value,
        ['components', cid, 'props'],
        0,
        canonicalInspectionContext,
      );
      if (sanitized !== undefined) cleanProps = sanitized as Record<string, unknown>;
      // 若 sanitized 为 undefined 且 issues 已增加，则会在最终检查中 fail-close
    }

    let cleanChildrenIds: string[] | undefined;
    if (childrenIdsDesc && 'value' in childrenIdsDesc && childrenIdsDesc.value !== undefined) {
      const rawArr = childrenIdsDesc.value as unknown[];
      if (Array.isArray(rawArr)) {
        const lenDesc = Object.getOwnPropertyDescriptor(rawArr, 'length');
        const len =
          lenDesc && 'value' in lenDesc && typeof lenDesc.value === 'number'
            ? (lenDesc.value as number)
            : 0;
        // 防御性预算检查：canonical 重建阶段的数组复制同样不做 O(len) 遍历
        if (len > limits.maxComponents) {
          pushIssue(canonicalInspectionContext, {
            code: 'CHILDREN_IDS_BUDGET_EXCEEDED',
            path: ['components', cid, 'childrenIds'],
            message: `childrenIds length (${len}) exceeded limit of ${limits.maxComponents}`,
          });
          return { ok: false, issues };
        }
        const arrCopy: string[] = [];
        for (let i = 0; i < len; i++) {
          const d = Object.getOwnPropertyDescriptor(rawArr, String(i));
          if (d && 'value' in d) arrCopy.push(d.value as string);
        }
        cleanChildrenIds = arrCopy;
      }
    }

    let cleanEvents: Record<string, unknown> | undefined;
    if (eventsDesc && 'value' in eventsDesc && eventsDesc.value !== undefined) {
      const rawEvents = eventsDesc.value as object;
      // 使用 inspector 深拷贝 events（包含 ActionList），若发现非法值会推入 issues
      const sanitizedEvents = inspectAndSanitizeJsonValue(
        rawEvents,
        ['components', cid, 'events'],
        0,
        canonicalInspectionContext,
      );
      if (sanitizedEvents !== undefined) {
        cleanEvents = sanitizedEvents as Record<string, unknown>;
      } else {
        // 若 sanitized 为 undefined 但 events 本身是空对象，inspector 返回 {}，不为 undefined；只有错误时才为 undefined
        // 为了保持语义，若原始 events 是空对象但 sanitization 返回 undefined 且无 issues，则保留空对象
        // 但目前若有 issues，整体会 fail-close，所以这里赋 undefined 也可以
        cleanEvents = undefined;
      }
    }

    const cleanComp: Record<string, unknown> = Object.create(null);
    Object.defineProperty(cleanComp, 'id', {
      value: idVal,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(cleanComp, 'type', {
      value: typeVal,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    if (cleanProps !== undefined) {
      Object.defineProperty(cleanComp, 'props', {
        value: cleanProps,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (cleanChildrenIds !== undefined) {
      Object.defineProperty(cleanComp, 'childrenIds', {
        value: cleanChildrenIds,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (cleanEvents !== undefined) {
      Object.defineProperty(cleanComp, 'events', {
        value: cleanEvents,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    Object.defineProperty(cleanComponents, cid, {
      value: cleanComp as unknown as ComponentNode,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const canonicalSchema: PageSchema = {
    schemaVersion: schemaVersion as PageSchema['schemaVersion'],
    rootId: rootId as string,
    components: cleanComponents,
    ...(cleanLogic ? { logic: cleanLogic } : {}),
  } as PageSchema;

  return {
    ok: true,
    value: deepFreeze(canonicalSchema),
  };
}
