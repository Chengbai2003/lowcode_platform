import type { PageSchema } from '../types/schema';
import type { SchemaCapability } from './types';

export interface DetectedCapabilityInfo {
  readonly capability: SchemaCapability;
  readonly primaryPath: readonly (string | number)[];
  readonly allPaths: readonly (readonly (string | number)[])[];
}

/**
 * 递归扫描动作容器，检测是否包含 runFlow 动作
 */
function scanActionListForRunFlow(
  actions: readonly unknown[],
  basePath: readonly (string | number)[],
  collector: (readonly (string | number)[])[],
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action || typeof action !== 'object') continue;
    const actionPath = [...basePath, i];

    const typeDesc = Object.getOwnPropertyDescriptor(action, 'type');
    if (typeDesc && typeDesc.value === 'runFlow') {
      collector.push(actionPath);
    }

    // 递归检查 Contract 允许的全部合法嵌套 ActionList 容器
    const thenDesc = Object.getOwnPropertyDescriptor(action, 'then');
    if (thenDesc && Array.isArray(thenDesc.value)) {
      scanActionListForRunFlow(thenDesc.value, [...actionPath, 'then'], collector);
    }

    const elseDesc = Object.getOwnPropertyDescriptor(action, 'else');
    if (elseDesc && Array.isArray(elseDesc.value)) {
      scanActionListForRunFlow(elseDesc.value, [...actionPath, 'else'], collector);
    }

    const actionsDesc = Object.getOwnPropertyDescriptor(action, 'actions');
    if (actionsDesc && Array.isArray(actionsDesc.value)) {
      scanActionListForRunFlow(actionsDesc.value, [...actionPath, 'actions'], collector);
    }

    const onSuccessDesc = Object.getOwnPropertyDescriptor(action, 'onSuccess');
    if (onSuccessDesc && Array.isArray(onSuccessDesc.value)) {
      scanActionListForRunFlow(onSuccessDesc.value, [...actionPath, 'onSuccess'], collector);
    }

    const onErrorDesc = Object.getOwnPropertyDescriptor(action, 'onError');
    if (onErrorDesc && Array.isArray(onErrorDesc.value)) {
      scanActionListForRunFlow(onErrorDesc.value, [...actionPath, 'onError'], collector);
    }

    const onOkDesc = Object.getOwnPropertyDescriptor(action, 'onOk');
    if (onOkDesc && Array.isArray(onOkDesc.value)) {
      scanActionListForRunFlow(onOkDesc.value, [...actionPath, 'onOk'], collector);
    }

    const onCancelDesc = Object.getOwnPropertyDescriptor(action, 'onCancel');
    if (onCancelDesc && Array.isArray(onCancelDesc.value)) {
      scanActionListForRunFlow(onCancelDesc.value, [...actionPath, 'onCancel'], collector);
    }
  }
}

/**
 * 纯能力检测器：从 canonical PageSchema 中分析所需的能力集合及其触发路径
 *
 * 规则：
 * 1. 声明字段存在即要求对应能力（包括合法空声明 {}）；
 * 2. 纯 Legacy（无 logic 且无 runFlow）不要求任何能力；
 * 3. 递归遍历组件事件和 ActionFlow 步骤中的所有 runFlow 动作；
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

  // 3. action-flow: logic.flows 声明 与 所有合法位置的 runFlow 动作
  const runFlowPaths: (readonly (string | number)[])[] = [];

  const hasFlowDeclarations = Boolean(
    schema.logic &&
    typeof schema.logic === 'object' &&
    Object.prototype.hasOwnProperty.call(schema.logic, 'flows') &&
    schema.logic.flows !== undefined,
  );

  if (hasFlowDeclarations) {
    runFlowPaths.push(['logic', 'flows']);
  }

  // 扫描组件事件中的 runFlow
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
            scanActionListForRunFlow(
              actions,
              ['components', compId, 'events', eventName],
              runFlowPaths,
            );
          }
        }
      }
    }
  }

  // 扫描 flow steps / onError 中的 runFlow
  if (schema.logic?.flows && typeof schema.logic.flows === 'object') {
    const flowKeys = Object.keys(schema.logic.flows);
    for (const flowKey of flowKeys) {
      if (!Object.prototype.hasOwnProperty.call(schema.logic.flows, flowKey)) continue;
      const flow = schema.logic.flows[flowKey];
      if (!flow || typeof flow !== 'object') continue;
      if (Array.isArray(flow.steps)) {
        scanActionListForRunFlow(flow.steps, ['logic', 'flows', flowKey, 'steps'], runFlowPaths);
      }
      if (Array.isArray(flow.onError)) {
        scanActionListForRunFlow(
          flow.onError,
          ['logic', 'flows', flowKey, 'onError'],
          runFlowPaths,
        );
      }
    }
  }

  if (runFlowPaths.length > 0) {
    detected.set('action-flow', {
      capability: 'action-flow',
      primaryPath: runFlowPaths[0],
      allPaths: runFlowPaths,
    });
  }

  return detected;
}
