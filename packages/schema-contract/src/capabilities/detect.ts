import type { PageSchema } from '../types/schema';
import type { SchemaCapability } from './types';

export interface DetectedCapabilityInfo {
  readonly capability: SchemaCapability;
  readonly primaryPath: readonly (string | number)[];
  readonly allPaths: readonly (readonly (string | number)[])[];
}

/**
 * Contract 允许的全部合法嵌套 ActionList 容器字段。
 * 与 validation/actions.ts 的递归校验、action-flow/analyze.ts 的
 * cloneCanonicalAction 容器清单保持同步。
 */
const ACTION_LIST_CONTAINER_FIELDS = [
  'then',
  'else',
  'actions',
  'onSuccess',
  'onError',
  'onOk',
  'onCancel',
] as const;

/**
 * 递归扫描动作容器，收集指定 action type 的全部出现位置
 */
function scanActionListForType(
  actions: readonly unknown[],
  basePath: readonly (string | number)[],
  actionType: string,
  collector: (readonly (string | number)[])[],
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action || typeof action !== 'object') continue;
    const actionPath = [...basePath, i];

    const typeDesc = Object.getOwnPropertyDescriptor(action, 'type');
    if (typeDesc && typeDesc.value === actionType) {
      collector.push(actionPath);
    }

    for (const containerField of ACTION_LIST_CONTAINER_FIELDS) {
      const containerDesc = Object.getOwnPropertyDescriptor(action, containerField);
      if (containerDesc && Array.isArray(containerDesc.value)) {
        scanActionListForType(
          containerDesc.value,
          [...actionPath, containerField],
          actionType,
          collector,
        );
      }
    }
  }
}

interface ActionContainerVisitor {
  (actions: readonly unknown[], basePath: readonly (string | number)[]): void;
}

/**
 * 遍历 canonical PageSchema 中承载 ActionList 的全部合法位置：
 * 组件事件绑定与 ActionFlow 的 steps / onError。
 */
function forEachActionListContainer(schema: PageSchema, visit: ActionContainerVisitor): void {
  if (schema.components && typeof schema.components === 'object') {
    const componentIds = Object.keys(schema.components);
    for (const compId of componentIds) {
      if (!Object.prototype.hasOwnProperty.call(schema.components, compId)) continue;
      const comp = schema.components[compId];
      if (!comp || typeof comp !== 'object') continue;
      if (comp.events && typeof comp.events === 'object') {
        const eventNames = Object.keys(comp.events);
        for (const eventName of eventNames) {
          if (!Object.prototype.hasOwnProperty.call(comp.events, eventName)) continue;
          const actions = comp.events[eventName];
          if (Array.isArray(actions)) {
            visit(actions, ['components', compId, 'events', eventName]);
          }
        }
      }
    }
  }

  if (schema.logic?.flows && typeof schema.logic.flows === 'object') {
    const flowKeys = Object.keys(schema.logic.flows);
    for (const flowKey of flowKeys) {
      if (!Object.prototype.hasOwnProperty.call(schema.logic.flows, flowKey)) continue;
      const flow = schema.logic.flows[flowKey];
      if (!flow || typeof flow !== 'object') continue;
      if (Array.isArray(flow.steps)) {
        visit(flow.steps, ['logic', 'flows', flowKey, 'steps']);
      }
      if (Array.isArray(flow.onError)) {
        visit(flow.onError, ['logic', 'flows', flowKey, 'onError']);
      }
    }
  }
}

/**
 * 纯能力检测器：从 canonical PageSchema 中分析所需的能力集合及其触发路径
 *
 * 规则：
 * 1. 声明字段存在即要求对应能力（包括合法空声明 {}）；
 * 2. 纯 Legacy（无 logic 且无 runFlow/executeDataSource）不要求任何能力；
 * 3. 递归遍历组件事件和 ActionFlow 步骤中的 runFlow / executeDataSource 动作；
 * 4. 不自行解析字符串表达式。
 */
export function detectPageSchemaCapabilities(
  schema: PageSchema,
): Map<SchemaCapability, DetectedCapabilityInfo> {
  const detected = new Map<SchemaCapability, DetectedCapabilityInfo>();

  if (!schema || typeof schema !== 'object') {
    return detected;
  }

  // 1. page-state: logic.states 声明
  if (
    schema.logic &&
    typeof schema.logic === 'object' &&
    Object.prototype.hasOwnProperty.call(schema.logic, 'states') &&
    schema.logic.states !== undefined
  ) {
    detected.set('page-state', {
      capability: 'page-state',
      primaryPath: ['logic', 'states'],
      allPaths: [['logic', 'states']],
    });
  }

  // 2. named-computed: logic.computed 声明
  if (
    schema.logic &&
    typeof schema.logic === 'object' &&
    Object.prototype.hasOwnProperty.call(schema.logic, 'computed') &&
    schema.logic.computed !== undefined
  ) {
    detected.set('named-computed', {
      capability: 'named-computed',
      primaryPath: ['logic', 'computed'],
      allPaths: [['logic', 'computed']],
    });
  }

  // 3. action-flow / data-source: 声明区域与所有合法位置的引用动作
  const runFlowPaths: (readonly (string | number)[])[] = [];
  const executeDataSourcePaths: (readonly (string | number)[])[] = [];

  const hasFlowDeclarations = Boolean(
    schema.logic &&
    typeof schema.logic === 'object' &&
    Object.prototype.hasOwnProperty.call(schema.logic, 'flows') &&
    schema.logic.flows !== undefined,
  );

  if (hasFlowDeclarations) {
    runFlowPaths.push(['logic', 'flows']);
  }

  const hasDataSourceDeclarations = Boolean(
    schema.logic &&
    typeof schema.logic === 'object' &&
    Object.prototype.hasOwnProperty.call(schema.logic, 'dataSources') &&
    schema.logic.dataSources !== undefined,
  );

  if (hasDataSourceDeclarations) {
    executeDataSourcePaths.push(['logic', 'dataSources']);
  }

  forEachActionListContainer(schema, (actions, basePath) => {
    scanActionListForType(actions, basePath, 'runFlow', runFlowPaths);
    scanActionListForType(actions, basePath, 'executeDataSource', executeDataSourcePaths);
  });

  if (runFlowPaths.length > 0) {
    detected.set('action-flow', {
      capability: 'action-flow',
      primaryPath: runFlowPaths[0],
      allPaths: runFlowPaths,
    });
  }

  if (executeDataSourcePaths.length > 0) {
    detected.set('data-source', {
      capability: 'data-source',
      primaryPath: executeDataSourcePaths[0],
      allPaths: executeDataSourcePaths,
    });
  }

  return detected;
}

/**
 * 递归收集 canonical PageSchema 中全部 apiCall 出现位置（PR D 执行策略用）。
 *
 * 覆盖与 executeDataSource 检测完全相同的合法位置：组件事件绑定与
 * ActionFlow 的 steps / onError，含 then/else/actions/onSuccess/onError/
 * onOk/onCancel 全部嵌套 ActionList 容器。纯 apiCall 页面（未触发任何
 * 语义能力）也会被完整扫描。
 */
export function detectPageSchemaApiCallUsage(
  schema: PageSchema,
): readonly (readonly (string | number)[])[] {
  const apiCallPaths: (readonly (string | number)[])[] = [];
  if (!schema || typeof schema !== 'object') {
    return apiCallPaths;
  }
  forEachActionListContainer(schema, (actions, basePath) => {
    scanActionListForType(actions, basePath, 'apiCall', apiCallPaths);
  });
  return apiCallPaths;
}
