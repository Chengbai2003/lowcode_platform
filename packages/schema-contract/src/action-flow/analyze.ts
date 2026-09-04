import type { ActionFlow, ActionFlowDeclarations } from '../types/logic';
import { isSafeLogicKey } from '../types/logic';
import type { Action, ActionList } from '../actions/action-union';
import type { SchemaValidationLimits } from '../types/limits';
import { normalizeValidationLimits } from '../types/limits';
import type { SchemaContractIssue } from '../validation/issues';
import { deepFreeze } from '../canonicalize';
import { validateActionList, type ActionValidationContext } from '../validation/actions';
import { pushIssue, type InspectionContext } from '../validation/inspector';
import { isPlainPrototype, safeGet } from '../internal/descriptor';
import { compareLogicKeys, pushMinHeap, popMinHeap } from '../internal/heap';

export interface ActionFlowNodeAnalysis {
  readonly key: string;
  readonly flow: ActionFlow;
  readonly flowDependencies: readonly string[];
}

export interface ActionFlowAnalysis {
  /** 依赖优先、同层按 key 字典序稳定排列。 */
  readonly nodes: readonly ActionFlowNodeAnalysis[];
  /** 规范化深冻结后的 Flow 声明字典。 */
  readonly flows: ActionFlowDeclarations;
  /** 拓扑排序后的 flow keys 列表。 */
  readonly order: readonly string[];
}

export type ActionFlowAnalysisResult =
  | { readonly ok: true; readonly value: ActionFlowAnalysis }
  | { readonly ok: false; readonly issues: readonly SchemaContractIssue[] };

function cloneCanonicalJson(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(cloneCanonicalJson);
  }
  if (val !== null && typeof val === 'object') {
    const clean: Record<string, unknown> = Object.create(null);
    for (const key of Object.getOwnPropertyNames(val)) {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (!desc || !('value' in desc)) continue;
      Object.defineProperty(clean, key, {
        value: cloneCanonicalJson(desc.value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return clean;
  }
  return val;
}

function cloneCanonicalAction(action: unknown): Action {
  const obj = action as Record<string, unknown>;
  const clean: Record<string, unknown> = Object.create(null);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc || !('value' in desc)) continue;
    const val = desc.value;
    let cleanVal: unknown;
    if (
      key === 'then' ||
      key === 'else' ||
      key === 'actions' ||
      key === 'onSuccess' ||
      key === 'onError' ||
      key === 'onOk' ||
      key === 'onCancel'
    ) {
      if (Array.isArray(val)) {
        cleanVal = cloneCanonicalActionList(val);
      } else {
        cleanVal = cloneCanonicalJson(val);
      }
    } else {
      cleanVal = cloneCanonicalJson(val);
    }
    Object.defineProperty(clean, key, {
      value: cleanVal,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return clean as unknown as Action;
}

function cloneCanonicalActionList(actions: readonly unknown[]): ActionList {
  return actions.map((item) => cloneCanonicalAction(item));
}

/**
 * 独立分析与校验 ActionFlow 声明。
 *
 * 纯函数，全链路 descriptor-safe，绝不触发 getter/setter。
 * 校验流程结构、安全 Logic Key、Action 节点预算/嵌套深度、缺失引用、循环引用与深引用链。
 * 严格保持输入不可变，构造全新的 canonical tree 并在输出上做完全深冻结。
 */
export function analyzeActionFlowDeclarations(
  declarations: unknown,
  customLimits?: Partial<SchemaValidationLimits>,
  basePath: readonly (string | number)[] = ['logic', 'flows'],
): ActionFlowAnalysisResult {
  const limits = normalizeValidationLimits(customLimits);
  const issues: SchemaContractIssue[] = [];

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

  if (declarations === undefined) {
    return {
      ok: true,
      value: deepFreeze({
        nodes: [],
        flows: {},
        order: [],
      }),
    };
  }

  if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_FLOWS_OBJECT',
      path: basePath,
      message: 'ActionFlow declarations must be a plain object',
    });
    return { ok: false, issues: Object.freeze(issues) };
  }

  const flowsObj = declarations as object;
  if (!isPlainPrototype(flowsObj)) {
    pushIssue(inspectionContext, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path: basePath,
      message: 'ActionFlow declarations must be a plain object',
    });
    return { ok: false, issues: Object.freeze(issues) };
  }

  // 1. 顶层 Symbol 与 Accessor 校验
  const symbols = Object.getOwnPropertySymbols(flowsObj);
  if (symbols.length > 0) {
    pushIssue(inspectionContext, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path: basePath,
      message: `Symbol property keys (${symbols.map(String).join(', ')}) are forbidden in ActionFlow declarations`,
    });
  }

  let hasTopAccessor = false;
  for (const key of Object.getOwnPropertyNames(flowsObj)) {
    if (inspectionContext.aborted) break;
    const desc = Object.getOwnPropertyDescriptor(flowsObj, key);
    if (desc && (desc.get || desc.set)) {
      pushIssue(inspectionContext, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, key],
        message: `Property "${key}" must not be an accessor (getter/setter)`,
      });
      hasTopAccessor = true;
    }
  }
  for (const sym of symbols) {
    if (inspectionContext.aborted) break;
    const desc = Object.getOwnPropertyDescriptor(flowsObj, sym);
    if (desc && (desc.get || desc.set)) {
      pushIssue(inspectionContext, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...basePath, String(sym)],
        message: `Symbol property "${String(sym)}" must not be an accessor`,
      });
      hasTopAccessor = true;
    }
  }

  if (hasTopAccessor || symbols.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  const flowKeys = Object.getOwnPropertyNames(flowsObj);
  if (flowKeys.length > limits.maxFlowEntries) {
    pushIssue(inspectionContext, {
      code: 'FLOW_ENTRIES_BUDGET_EXCEEDED',
      path: basePath,
      message: `ActionFlow entry count (${flowKeys.length}) exceeded limit of ${limits.maxFlowEntries}`,
    });
    return { ok: false, issues: Object.freeze(issues) };
  }

  flowKeys.sort(compareLogicKeys);

  // 2. 第一轮：收集并校验合法 Flow Key
  const declaredFlowKeys = new Set<string>();
  for (const flowKey of flowKeys) {
    if (inspectionContext.aborted) break;
    if (!isSafeLogicKey(flowKey)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_FLOW_KEY',
        path: [...basePath, flowKey],
        message: `Flow key "${flowKey}" must be a safe identifier`,
      });
      continue;
    }
    declaredFlowKeys.add(flowKey);
  }

  if (inspectionContext.aborted) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  // 3. 第二轮：校验每个 Flow 对象及其 steps / onError，并收集 runFlow 依赖
  let currentDeps = new Set<string>();
  const actionValidationContext: ActionValidationContext = {
    issues,
    inspectionContext,
    maxActionNodes: limits.maxActionNodes,
    maxActionDepth: limits.maxActionDepth,
    allowLegacyNestedStateTargets: true,
    actionCount: 0,
    actionBudgetReported: false,
    flowValidation: {
      declaredFlowKeys,
      onFlowReference(targetFlow) {
        currentDeps.add(targetFlow);
      },
    },
  };

  const declaredNodes: Array<{
    key: string;
    flow: ActionFlow;
    flowDependencies: string[];
  }> = [];

  for (const flowKey of flowKeys) {
    if (inspectionContext.aborted) break;

    const flowDesc = Object.getOwnPropertyDescriptor(flowsObj, flowKey);
    if (!flowDesc || flowDesc.get || flowDesc.set) continue;

    const flowVal = flowDesc.value;
    if (!flowVal || typeof flowVal !== 'object' || Array.isArray(flowVal)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_FLOWS_OBJECT',
        path: [...basePath, flowKey],
        message: `ActionFlow "${flowKey}" must be a plain object`,
      });
      continue;
    }

    const flowObj = flowVal as object;
    if (!isPlainPrototype(flowObj)) {
      pushIssue(inspectionContext, {
        code: 'INVALID_OBJECT_PROTOTYPE',
        path: [...basePath, flowKey],
        message: `ActionFlow "${flowKey}" must be a plain object`,
      });
      continue;
    }

    const flowSymbols = Object.getOwnPropertySymbols(flowObj);
    if (flowSymbols.length > 0) {
      pushIssue(inspectionContext, {
        code: 'SYMBOL_PROPERTY_FORBIDDEN',
        path: [...basePath, flowKey],
        message: `Symbol property keys (${flowSymbols.map(String).join(', ')}) are forbidden on ActionFlow "${flowKey}"`,
      });
    }

    let hasFlowAccessor = false;
    for (const prop of Object.getOwnPropertyNames(flowObj)) {
      if (inspectionContext.aborted) break;
      const pDesc = Object.getOwnPropertyDescriptor(flowObj, prop);
      if (pDesc && (pDesc.get || pDesc.set)) {
        pushIssue(inspectionContext, {
          code: 'ACCESSOR_PROPERTY_FORBIDDEN',
          path: [...basePath, flowKey, prop],
          message: `Property "${prop}" on ActionFlow "${flowKey}" must not be an accessor`,
        });
        hasFlowAccessor = true;
      }
    }
    for (const sym of flowSymbols) {
      if (inspectionContext.aborted) break;
      const pDesc = Object.getOwnPropertyDescriptor(flowObj, sym);
      if (pDesc && (pDesc.get || pDesc.set)) {
        pushIssue(inspectionContext, {
          code: 'ACCESSOR_PROPERTY_FORBIDDEN',
          path: [...basePath, flowKey, String(sym)],
          message: `Symbol property "${String(sym)}" on ActionFlow "${flowKey}" must not be an accessor`,
        });
        hasFlowAccessor = true;
      }
    }

    if (hasFlowAccessor || flowSymbols.length > 0 || inspectionContext.aborted) {
      continue;
    }

    // 字段白名单检查：仅允许 steps 与 onError
    for (const field of Object.getOwnPropertyNames(flowObj)) {
      if (inspectionContext.aborted) break;
      if (field !== 'steps' && field !== 'onError') {
        pushIssue(inspectionContext, {
          code: 'UNKNOWN_FLOW_FIELD',
          path: [...basePath, flowKey, field],
          message: `Unknown field "${field}" on ActionFlow "${flowKey}" (fail-close)`,
        });
      }
    }
    if (inspectionContext.aborted) break;

    // steps 必须存在且至少一个节点
    const stepsRes = safeGet(flowObj, 'steps');
    const stepsVal = stepsRes.exists ? stepsRes.value : undefined;
    if (!stepsRes.exists || !Array.isArray(stepsVal) || stepsVal.length === 0) {
      pushIssue(inspectionContext, {
        code: 'FLOW_STEPS_REQUIRED',
        path: [...basePath, flowKey, 'steps'],
        message: `ActionFlow "${flowKey}" requires a non-empty "steps" array`,
      });
      continue;
    }

    // onError 可选；own property 存在时必须是非空数组，否则 fail-close
    const onErrorRes = safeGet(flowObj, 'onError');
    const onErrorVal = onErrorRes.exists ? onErrorRes.value : undefined;
    if (onErrorRes.exists) {
      if (!Array.isArray(onErrorVal) || onErrorVal.length === 0) {
        pushIssue(inspectionContext, {
          code: 'INVALID_FLOW_ON_ERROR',
          path: [...basePath, flowKey, 'onError'],
          message: `ActionFlow "${flowKey}" onError must be a non-empty array of actions if provided`,
        });
        continue;
      }
    }

    // 校验 steps 与 onError 内的 Action，并收录 runFlow 依赖
    currentDeps = new Set<string>();

    validateActionList(stepsVal, [...basePath, flowKey, 'steps'], 1, actionValidationContext);
    if (inspectionContext.aborted) break;

    if (onErrorRes.exists && Array.isArray(onErrorVal) && onErrorVal.length > 0) {
      validateActionList(onErrorVal, [...basePath, flowKey, 'onError'], 1, actionValidationContext);
      if (inspectionContext.aborted) break;
    }

    const flowDependencies = Array.from(currentDeps).sort(compareLogicKeys);
    // 构造独立的 canonical tree，防止 deepFreeze 反向污染/冻结调用方入参
    const cleanFlow: ActionFlow = {
      steps: cloneCanonicalActionList(stepsVal),
      ...(onErrorRes.exists && Array.isArray(onErrorVal) && onErrorVal.length > 0
        ? { onError: cloneCanonicalActionList(onErrorVal) }
        : {}),
    };

    declaredNodes.push({
      key: flowKey,
      flow: cleanFlow,
      flowDependencies,
    });
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  // 4. 拓扑排序与循环依赖检测 (Kahn's Algorithm with Min-Heap)
  const nodesMap = new Map(declaredNodes.map((node) => [node.key, node]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of declaredNodes) {
    if (inspectionContext.aborted) break;
    indegree.set(node.key, node.flowDependencies.length);
    for (const dep of node.flowDependencies) {
      if (!nodesMap.has(dep)) {
        pushIssue(inspectionContext, {
          code: 'FLOW_REFERENCE_MISSING',
          path: [...basePath, node.key],
          message: `ActionFlow "${node.key}" references undefined flow "${dep}"`,
        });
        if (inspectionContext.aborted) break;
      }
      const list = dependents.get(dep) ?? [];
      list.push(node.key);
      dependents.set(dep, list);
    }
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  const ready: string[] = [];
  for (const node of declaredNodes) {
    if ((indegree.get(node.key) ?? 0) === 0) {
      pushMinHeap(ready, node.key);
    }
  }

  const order: string[] = [];
  while (ready.length > 0) {
    const key = popMinHeap(ready)!;
    order.push(key);
    for (const dep of dependents.get(key) ?? []) {
      const nextDegree = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, nextDegree);
      if (nextDegree === 0) pushMinHeap(ready, dep);
    }
  }

  if (order.length !== declaredNodes.length) {
    const orderedSet = new Set(order);
    const unresolvedKeys = declaredNodes
      .map((n) => n.key)
      .filter((k) => !orderedSet.has(k))
      .sort(compareLogicKeys);

    // 寻找真实成环的关键节点
    const cycleKeys: string[] = [];
    for (const key of unresolvedKeys) {
      const visited = new Set<string>();
      let inCycle = false;
      const dfs = (curr: string) => {
        if (inCycle) return;
        visited.add(curr);
        const deps = nodesMap.get(curr)?.flowDependencies ?? [];
        for (const dep of deps) {
          if (!orderedSet.has(dep)) {
            if (dep === key || visited.has(dep)) {
              inCycle = true;
              return;
            }
            dfs(dep);
          }
        }
      };
      dfs(key);
      if (inCycle) {
        cycleKeys.push(key);
      }
    }

    const reportedCycleKeys = cycleKeys.length > 0 ? cycleKeys : unresolvedKeys;
    for (const cycleKey of reportedCycleKeys) {
      pushIssue(inspectionContext, {
        code: 'FLOW_REFERENCE_CYCLE',
        path: [...basePath, cycleKey],
        message: `ActionFlow cycle detected involving flow "${cycleKey}"`,
      });
      if (inspectionContext.aborted) break;
    }

    return { ok: false, issues: Object.freeze(issues) };
  }

  // 5. 跨 Flow 引用链深度检查 (复用 maxActionDepth)
  // 在无环 DAG 中，按拓扑序 (依赖优先) 递推最长引用深度
  const chainDepths = new Map<string, number>();
  for (const key of order) {
    if (inspectionContext.aborted) break;
    const deps = nodesMap.get(key)!.flowDependencies;
    let maxDepDepth = 0;
    for (const dep of deps) {
      const d = chainDepths.get(dep) ?? 1;
      if (d > maxDepDepth) maxDepDepth = d;
    }
    const depth = maxDepDepth + 1;
    chainDepths.set(key, depth);
    if (depth > limits.maxActionDepth) {
      pushIssue(inspectionContext, {
        code: 'ACTION_DEPTH_EXCEEDED',
        path: [...basePath, key],
        message: `ActionFlow reference chain depth (${depth}) exceeded limit of ${limits.maxActionDepth}`,
      });
    }
  }

  if (issues.length > 0 || inspectionContext.aborted) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  // 6. 构造稳定深冻结的分析输出
  const nodes: ActionFlowNodeAnalysis[] = order.map((key) => {
    const item = nodesMap.get(key)!;
    return {
      key,
      flow: item.flow,
      flowDependencies: item.flowDependencies,
    };
  });

  const flowsMap: Record<string, ActionFlow> = {};
  for (const item of declaredNodes) {
    flowsMap[item.key] = item.flow;
  }

  return {
    ok: true,
    value: deepFreeze({
      nodes,
      flows: flowsMap,
      order,
    }),
  };
}
