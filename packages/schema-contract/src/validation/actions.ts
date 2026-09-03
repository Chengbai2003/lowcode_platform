import type { SchemaContractIssue } from './issues';
import type { InspectionContext } from './inspector';
import { inspectAndSanitizeJsonValue } from './inspector';
import { describeValue } from './describe';
import { isSafeDataPathKey, isSafeLogicKey } from '../types/logic';

export interface ActionValidationContext {
  readonly issues: SchemaContractIssue[];
  readonly inspectionContext: InspectionContext;
  readonly maxActionNodes: number;
  readonly maxActionDepth: number;
  allowLegacyNestedStateTargets: boolean;
  actionCount: number;
  /** ACTION_BUDGET_EXCEEDED 只报告一次 */
  actionBudgetReported: boolean;
}

/**
 * 收录一条 action 校验 issue；与 JSON 校验共享 issue 预算与 abort 标记。
 */
function pushActionIssue(context: ActionValidationContext, issue: SchemaContractIssue): void {
  const sink = context.inspectionContext;
  if (sink.aborted) return;
  if (context.issues.length >= sink.maxIssues) {
    sink.aborted = true;
    return;
  }
  context.issues.push(issue);
}

const FORBIDDEN_IDENTIFIERS = new Set([
  'eval',
  'arguments',
  'Function',
  'window',
  'document',
  'globalThis',
  'constructor',
  '__proto__',
  'prototype',
]);

export function isSafeIdentifier(name: unknown): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  return (
    /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) &&
    !name.startsWith('__') &&
    !FORBIDDEN_IDENTIFIERS.has(name)
  );
}

function isPlainPrototype(obj: object): boolean {
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

function safeGet(
  obj: object,
  key: string,
): { exists: boolean; isAccessor: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return { exists: false, isAccessor: false, value: undefined };
  if (desc.get || desc.set) return { exists: true, isAccessor: true, value: undefined };
  return { exists: true, isAccessor: false, value: (desc as PropertyDescriptor).value };
}

function validateLogicTarget(
  value: unknown,
  path: readonly (string | number)[],
  context: ActionValidationContext,
): void {
  if (typeof value !== 'string') return;
  if (value.startsWith('computed.')) {
    pushActionIssue(context, {
      code: 'COMPUTED_TARGET_READONLY',
      path,
      message: `Computed target "${value}" is read-only`,
    });
    return;
  }
  if (!value.startsWith('state.')) return;

  const stateKey = value.slice('state.'.length);
  const pathParts = stateKey.split('.');
  const isSafeLegacyPath =
    context.allowLegacyNestedStateTargets && pathParts.every(isSafeDataPathKey);
  if (isSafeLegacyPath || isSafeLogicKey(stateKey)) {
    return;
  }

  pushActionIssue(context, {
    code: 'INVALID_STATE_TARGET',
    path,
    message: `State target "${value}" must reference one safe top-level Logic Key`,
  });
}

function checkUnknownActionFields(
  actionObj: object,
  allowedFields: readonly string[],
  path: readonly (string | number)[],
  context: ActionValidationContext,
): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.getOwnPropertyNames(actionObj)) {
    if (context.inspectionContext.aborted) return;
    if (!allowed.has(key)) {
      // For error message, get type via descriptor safe
      const typeDesc = Object.getOwnPropertyDescriptor(actionObj, 'type');
      const typeVal = typeDesc && 'value' in typeDesc ? describeValue(typeDesc.value) : 'unknown';
      pushActionIssue(context, {
        code: 'UNKNOWN_ACTION_FIELD',
        path: [...path, key],
        message: `Unknown field "${key}" on action of type "${typeVal}"`,
      });
    }
  }
  const symbols = Object.getOwnPropertySymbols(actionObj);
  for (const sym of symbols) {
    if (context.inspectionContext.aborted) return;
    const typeDesc = Object.getOwnPropertyDescriptor(actionObj, 'type');
    const typeVal = typeDesc && 'value' in typeDesc ? describeValue(typeDesc.value) : 'unknown';
    pushActionIssue(context, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path: [...path, String(sym)],
      message: `Symbol field "${String(sym)}" forbidden on action of type "${typeVal}"`,
    });
  }
}

export function validateActionList(
  actions: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: ActionValidationContext,
): void {
  if (context.inspectionContext.aborted) return;

  if (!Array.isArray(actions)) {
    pushActionIssue(context, {
      code: 'INVALID_ACTION_LIST',
      path,
      message: 'Action list must be an array',
    });
    return;
  }

  const arrObj = actions as unknown as object;
  if (Object.getPrototypeOf(arrObj) !== Array.prototype) {
    pushActionIssue(context, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path,
      message: 'Action list must be a plain array',
    });
    return;
  }

  const arrSymbols = Object.getOwnPropertySymbols(arrObj);
  if (arrSymbols.length > 0) {
    pushActionIssue(context, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path,
      message: `Symbol property keys (${arrSymbols.map(String).join(', ')}) are forbidden in action list`,
    });
  }

  const arrNames = Object.getOwnPropertyNames(arrObj);
  for (const key of arrNames) {
    if (context.inspectionContext.aborted) return;
    if (key === 'length') continue;
    const num = Number(key);
    const isIndex = String(num) === key && Number.isInteger(num) && num >= 0 && num < 4294967295;
    if (!isIndex) {
      pushActionIssue(context, {
        code: 'UNKNOWN_ARRAY_FIELD',
        path: [...path, key],
        message: `Action list property "${key}" is forbidden (non-index)`,
      });
    }
  }

  const lenDesc = Object.getOwnPropertyDescriptor(arrObj, 'length');
  if (lenDesc && (lenDesc.get || lenDesc.set)) {
    pushActionIssue(context, {
      code: 'ACCESSOR_PROPERTY_FORBIDDEN',
      path: [...path, 'length'],
      message: 'Action list length must not be an accessor',
    });
    return;
  }

  let len = 0;
  if (
    lenDesc &&
    'value' in lenDesc &&
    typeof lenDesc.value === 'number' &&
    Number.isInteger(lenDesc.value) &&
    lenDesc.value >= 0
  ) {
    len = lenDesc.value;
  } else if (Array.isArray(actions)) {
    // fallback using safe length via descriptor already handled, but if descriptor missing, use 0 and flag?
    len = (actions as unknown[]).length;
  }

  if (depth > context.maxActionDepth) {
    pushActionIssue(context, {
      code: 'ACTION_DEPTH_EXCEEDED',
      path,
      message: `Action nesting depth exceeded limit of ${context.maxActionDepth}`,
    });
    return;
  }

  // 预算前置检查：长度超过剩余 action 预算时直接拒绝，绝不进行 O(len) 遍历
  if (len > context.maxActionNodes - context.actionCount) {
    if (!context.actionBudgetReported) {
      context.actionBudgetReported = true;
      pushActionIssue(context, {
        code: 'ACTION_BUDGET_EXCEEDED',
        path,
        message: `Action list length (${len}) exceeds remaining action budget (${context.maxActionNodes - context.actionCount} of ${context.maxActionNodes}); traversal aborted`,
      });
    }
    context.inspectionContext.aborted = true;
    return;
  }

  for (let i = 0; i < len; i++) {
    if (context.inspectionContext.aborted) return;
    const desc = Object.getOwnPropertyDescriptor(arrObj, String(i));
    if (!desc) {
      pushActionIssue(context, {
        code: 'SPARSE_ARRAY_FORBIDDEN',
        path: [...path, i],
        message: 'Sparse arrays are forbidden in action list',
      });
      continue;
    }
    if (desc.get || desc.set) {
      pushActionIssue(context, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...path, i],
        message: `Action list index "${i}" must not be an accessor`,
      });
      continue;
    }
    if ('value' in desc) {
      validateActionItem(desc.value, [...path, i], depth, context);
    }
  }
}

export function validateActionItem(
  action: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: ActionValidationContext,
): void {
  if (context.inspectionContext.aborted) return;

  context.actionCount++;
  if (context.actionCount > context.maxActionNodes) {
    if (!context.actionBudgetReported) {
      context.actionBudgetReported = true;
      pushActionIssue(context, {
        code: 'ACTION_BUDGET_EXCEEDED',
        path,
        message: `Total action count exceeded limit of ${context.maxActionNodes}`,
      });
    }
    context.inspectionContext.aborted = true;
    return;
  }

  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    pushActionIssue(context, {
      code: 'INVALID_ACTION_OBJECT',
      path,
      message: 'Each action must be an object',
    });
    return;
  }

  const actionObj = action as object;

  if (!isPlainPrototype(actionObj)) {
    pushActionIssue(context, {
      code: 'INVALID_OBJECT_PROTOTYPE',
      path,
      message: 'Each action must be a plain object',
    });
    return;
  }

  const symbols = Object.getOwnPropertySymbols(actionObj);
  if (symbols.length > 0) {
    pushActionIssue(context, {
      code: 'SYMBOL_PROPERTY_FORBIDDEN',
      path,
      message: `Symbol property keys (${symbols.map((s) => s.toString()).join(', ')}) are forbidden in action`,
    });
    // continue to also check accessors, but we will not return yet? we should still reject but continue to avoid executing getter
  }

  let hasAccessor = false;
  for (const key of Object.getOwnPropertyNames(actionObj)) {
    const desc = Object.getOwnPropertyDescriptor(actionObj, key);
    if (!desc) continue;
    if (desc.get || desc.set) {
      pushActionIssue(context, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...path, key],
        message: `Action property "${key}" must not be an accessor (getter/setter)`,
      });
      hasAccessor = true;
    }
  }
  for (const sym of symbols) {
    const desc = Object.getOwnPropertyDescriptor(actionObj, sym);
    if (desc && (desc.get || desc.set)) {
      pushActionIssue(context, {
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...path, String(sym)],
        message: `Action symbol property "${String(sym)}" must not be an accessor`,
      });
      hasAccessor = true;
    }
  }
  if (hasAccessor || symbols.length > 0) {
    return;
  }

  const typeRes = safeGet(actionObj, 'type');
  const type = typeRes.exists ? typeRes.value : undefined;

  if (typeof type !== 'string' || !type.trim()) {
    pushActionIssue(context, {
      code: 'ACTION_TYPE_REQUIRED',
      path: [...path, 'type'],
      message: 'Action type is required',
    });
    return;
  }

  if (type === 'customScript') {
    pushActionIssue(context, {
      code: 'FORBIDDEN_CUSTOM_SCRIPT',
      path: [...path, 'type'],
      message: 'customScript is permanently forbidden in PageSchema',
    });
    return;
  }

  switch (type) {
    case 'setValue': {
      checkUnknownActionFields(actionObj, ['type', 'field', 'value', 'merge'], path, context);
      const fieldRes = safeGet(actionObj, 'field');
      const valueRes = safeGet(actionObj, 'value');
      const mergeRes = safeGet(actionObj, 'merge');
      const fieldVal = fieldRes.exists ? fieldRes.value : undefined;
      const valueVal = valueRes.exists ? valueRes.value : undefined;
      const mergeVal = mergeRes.exists ? mergeRes.value : undefined;

      if (typeof fieldVal !== 'string' || !fieldVal.trim()) {
        pushActionIssue(context, {
          code: 'ACTION_FIELD_REQUIRED',
          path: [...path, 'field'],
          message: 'setValue action requires a non-empty string "field"',
        });
      } else {
        validateLogicTarget(fieldVal, [...path, 'field'], context);
      }
      if (!valueRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_VALUE_REQUIRED',
          path: [...path, 'value'],
          message: 'setValue action requires "value"',
        });
      } else {
        inspectAndSanitizeJsonValue(valueVal, [...path, 'value'], 0, context.inspectionContext);
      }
      if (mergeRes.exists && mergeVal !== undefined && typeof mergeVal !== 'boolean') {
        pushActionIssue(context, {
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'merge'],
          message: 'setValue "merge" must be a boolean if provided',
        });
      }
      break;
    }

    case 'if': {
      checkUnknownActionFields(actionObj, ['type', 'condition', 'then', 'else'], path, context);
      const conditionRes = safeGet(actionObj, 'condition');
      const thenRes = safeGet(actionObj, 'then');
      const elseRes = safeGet(actionObj, 'else');
      const conditionVal = conditionRes.exists ? conditionRes.value : undefined;
      const thenVal = thenRes.exists ? thenRes.value : undefined;
      const elseVal = elseRes.exists ? elseRes.value : undefined;

      if (!conditionRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_CONDITION_REQUIRED',
          path: [...path, 'condition'],
          message: 'if action requires "condition"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          conditionVal,
          [...path, 'condition'],
          0,
          context.inspectionContext,
        );
      }
      if (!thenRes.exists || !Array.isArray(thenVal)) {
        pushActionIssue(context, {
          code: 'ACTION_THEN_REQUIRED',
          path: [...path, 'then'],
          message: 'if action requires "then" array of actions',
        });
      } else {
        validateActionList(thenVal, [...path, 'then'], depth + 1, context);
      }
      if (elseRes.exists) {
        if (!Array.isArray(elseVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'else'],
            message: 'if "else" must be an array of actions if provided',
          });
        } else {
          validateActionList(elseVal, [...path, 'else'], depth + 1, context);
        }
      }
      break;
    }

    case 'loop': {
      checkUnknownActionFields(
        actionObj,
        ['type', 'over', 'itemVar', 'indexVar', 'actions'],
        path,
        context,
      );
      const overRes = safeGet(actionObj, 'over');
      const itemVarRes = safeGet(actionObj, 'itemVar');
      const indexVarRes = safeGet(actionObj, 'indexVar');
      const actionsRes = safeGet(actionObj, 'actions');
      const overVal = overRes.exists ? overRes.value : undefined;
      const itemVarVal = itemVarRes.exists ? itemVarRes.value : undefined;
      const indexVarVal = indexVarRes.exists ? indexVarRes.value : undefined;
      const actionsVal = actionsRes.exists ? actionsRes.value : undefined;

      if (!overRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_OVER_REQUIRED',
          path: [...path, 'over'],
          message: 'loop action requires "over" target',
        });
      } else {
        inspectAndSanitizeJsonValue(overVal, [...path, 'over'], 0, context.inspectionContext);
      }
      if (!isSafeIdentifier(itemVarVal)) {
        pushActionIssue(context, {
          code: 'INVALID_LOOP_IDENTIFIER',
          path: [...path, 'itemVar'],
          message: `loop itemVar must be a valid, safe identifier, received: ${describeValue(itemVarVal)}`,
        });
      }
      if (indexVarRes.exists && indexVarVal !== undefined) {
        if (!isSafeIdentifier(indexVarVal)) {
          pushActionIssue(context, {
            code: 'INVALID_LOOP_IDENTIFIER',
            path: [...path, 'indexVar'],
            message: `loop indexVar must be a valid, safe identifier, received: ${describeValue(indexVarVal)}`,
          });
        } else if (itemVarVal === indexVarVal) {
          pushActionIssue(context, {
            code: 'LOOP_VAR_COLLISION',
            path: [...path, 'indexVar'],
            message: `loop indexVar cannot be identical to itemVar: ${describeValue(itemVarVal)}`,
          });
        }
      }
      if (!actionsRes.exists || !Array.isArray(actionsVal)) {
        pushActionIssue(context, {
          code: 'ACTION_ACTIONS_REQUIRED',
          path: [...path, 'actions'],
          message: 'loop action requires "actions" array',
        });
      } else {
        validateActionList(actionsVal, [...path, 'actions'], depth + 1, context);
      }
      break;
    }

    case 'navigate': {
      checkUnknownActionFields(actionObj, ['type', 'to', 'params', 'replace'], path, context);
      const toRes = safeGet(actionObj, 'to');
      const paramsRes = safeGet(actionObj, 'params');
      const replaceRes = safeGet(actionObj, 'replace');
      const toVal = toRes.exists ? toRes.value : undefined;
      const paramsVal = paramsRes.exists ? paramsRes.value : undefined;
      const replaceVal = replaceRes.exists ? replaceRes.value : undefined;

      if (!toRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_TO_REQUIRED',
          path: [...path, 'to'],
          message: 'navigate action requires "to" destination',
        });
      } else {
        inspectAndSanitizeJsonValue(toVal, [...path, 'to'], 0, context.inspectionContext);
      }
      if (paramsRes.exists) {
        if (!paramsVal || typeof paramsVal !== 'object' || Array.isArray(paramsVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'params'],
            message: 'navigate "params" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(paramsVal, [...path, 'params'], 0, context.inspectionContext);
        }
      }
      if (replaceRes.exists && replaceVal !== undefined && typeof replaceVal !== 'boolean') {
        pushActionIssue(context, {
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'replace'],
          message: 'navigate "replace" must be a boolean if provided',
        });
      }
      break;
    }

    case 'delay': {
      checkUnknownActionFields(actionObj, ['type', 'ms'], path, context);
      const msRes = safeGet(actionObj, 'ms');
      const msVal = msRes.exists ? msRes.value : undefined;
      if (msRes.exists) {
        if (typeof msVal !== 'number' || !Number.isFinite(msVal) || msVal < 0) {
          pushActionIssue(context, {
            code: 'INVALID_DELAY_MS',
            path: [...path, 'ms'],
            message: 'delay "ms" must be a non-negative finite number',
          });
        }
      }
      break;
    }

    case 'feedback': {
      checkUnknownActionFields(
        actionObj,
        ['type', 'kind', 'content', 'title', 'level', 'placement', 'duration'],
        path,
        context,
      );
      const kindRes = safeGet(actionObj, 'kind');
      const contentRes = safeGet(actionObj, 'content');
      const titleRes = safeGet(actionObj, 'title');
      const levelRes = safeGet(actionObj, 'level');
      const placementRes = safeGet(actionObj, 'placement');
      const durationRes = safeGet(actionObj, 'duration');
      const kindVal = kindRes.exists ? kindRes.value : undefined;
      const contentVal = contentRes.exists ? contentRes.value : undefined;
      const titleVal = titleRes.exists ? titleRes.value : undefined;
      const levelVal = levelRes.exists ? levelRes.value : undefined;
      const placementVal = placementRes.exists ? placementRes.value : undefined;
      const durationVal = durationRes.exists ? durationRes.value : undefined;

      if (
        kindRes.exists &&
        kindVal !== undefined &&
        kindVal !== 'message' &&
        kindVal !== 'notification'
      ) {
        pushActionIssue(context, {
          code: 'INVALID_FEEDBACK_KIND',
          path: [...path, 'kind'],
          message: 'feedback "kind" must be "message" or "notification"',
        });
      }
      if (!contentRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_CONTENT_REQUIRED',
          path: [...path, 'content'],
          message: 'feedback action requires "content"',
        });
      } else {
        inspectAndSanitizeJsonValue(contentVal, [...path, 'content'], 0, context.inspectionContext);
      }
      if (titleRes.exists) {
        inspectAndSanitizeJsonValue(titleVal, [...path, 'title'], 0, context.inspectionContext);
      }
      if (
        levelRes.exists &&
        levelVal !== undefined &&
        !['success', 'error', 'warning', 'info'].includes(levelVal as string)
      ) {
        pushActionIssue(context, {
          code: 'INVALID_FEEDBACK_LEVEL',
          path: [...path, 'level'],
          message: 'feedback "level" must be "success", "error", "warning", or "info"',
        });
      }
      if (
        placementRes.exists &&
        placementVal !== undefined &&
        !['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(placementVal as string)
      ) {
        pushActionIssue(context, {
          code: 'INVALID_FEEDBACK_PLACEMENT',
          path: [...path, 'placement'],
          message:
            'feedback "placement" must be "topLeft", "topRight", "bottomLeft", or "bottomRight"',
        });
      }
      if (
        durationRes.exists &&
        durationVal !== undefined &&
        (typeof durationVal !== 'number' || !Number.isFinite(durationVal) || durationVal < 0)
      ) {
        pushActionIssue(context, {
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'duration'],
          message: 'feedback "duration" must be a non-negative finite number',
        });
      }
      break;
    }

    case 'dialog': {
      checkUnknownActionFields(
        actionObj,
        ['type', 'kind', 'title', 'content', 'onOk', 'onCancel'],
        path,
        context,
      );
      const kindRes = safeGet(actionObj, 'kind');
      const contentRes = safeGet(actionObj, 'content');
      const titleRes = safeGet(actionObj, 'title');
      const onOkRes = safeGet(actionObj, 'onOk');
      const onCancelRes = safeGet(actionObj, 'onCancel');
      const kindVal = kindRes.exists ? kindRes.value : undefined;
      const contentVal = contentRes.exists ? contentRes.value : undefined;
      const titleVal = titleRes.exists ? titleRes.value : undefined;
      const onOkVal = onOkRes.exists ? onOkRes.value : undefined;
      const onCancelVal = onCancelRes.exists ? onCancelRes.value : undefined;

      if (kindVal !== 'modal' && kindVal !== 'confirm') {
        pushActionIssue(context, {
          code: 'INVALID_DIALOG_KIND',
          path: [...path, 'kind'],
          message: 'dialog "kind" is required and must be "modal" or "confirm"',
        });
      }
      if (!contentRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_CONTENT_REQUIRED',
          path: [...path, 'content'],
          message: 'dialog action requires "content"',
        });
      } else {
        inspectAndSanitizeJsonValue(contentVal, [...path, 'content'], 0, context.inspectionContext);
      }
      if (titleRes.exists) {
        inspectAndSanitizeJsonValue(titleVal, [...path, 'title'], 0, context.inspectionContext);
      }
      if (onOkRes.exists) {
        if (!Array.isArray(onOkVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onOk'],
            message: 'dialog "onOk" must be an array of actions if provided',
          });
        } else {
          validateActionList(onOkVal, [...path, 'onOk'], depth + 1, context);
        }
      }
      if (onCancelRes.exists) {
        if (!Array.isArray(onCancelVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onCancel'],
            message: 'dialog "onCancel" must be an array of actions if provided',
          });
        } else {
          validateActionList(onCancelVal, [...path, 'onCancel'], depth + 1, context);
        }
      }
      break;
    }

    case 'log': {
      checkUnknownActionFields(actionObj, ['type', 'value', 'level'], path, context);
      const valueRes = safeGet(actionObj, 'value');
      const levelRes = safeGet(actionObj, 'level');
      const valueVal = valueRes.exists ? valueRes.value : undefined;
      const levelVal = levelRes.exists ? levelRes.value : undefined;
      if (!valueRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_VALUE_REQUIRED',
          path: [...path, 'value'],
          message: 'log action requires "value"',
        });
      } else {
        inspectAndSanitizeJsonValue(valueVal, [...path, 'value'], 0, context.inspectionContext);
      }
      if (
        levelRes.exists &&
        levelVal !== undefined &&
        !['log', 'info', 'warn', 'error'].includes(levelVal as string)
      ) {
        pushActionIssue(context, {
          code: 'INVALID_LOG_LEVEL',
          path: [...path, 'level'],
          message: 'log "level" must be "log", "info", "warn", or "error"',
        });
      }
      break;
    }

    case 'apiCall': {
      checkUnknownActionFields(
        actionObj,
        [
          'type',
          'url',
          'method',
          'body',
          'headers',
          'params',
          'resultTo',
          'onSuccess',
          'onError',
          'showError',
        ],
        path,
        context,
      );
      const urlRes = safeGet(actionObj, 'url');
      const methodRes = safeGet(actionObj, 'method');
      const bodyRes = safeGet(actionObj, 'body');
      const headersRes = safeGet(actionObj, 'headers');
      const paramsRes = safeGet(actionObj, 'params');
      const resultToRes = safeGet(actionObj, 'resultTo');
      const onSuccessRes = safeGet(actionObj, 'onSuccess');
      const onErrorRes = safeGet(actionObj, 'onError');
      const showErrorRes = safeGet(actionObj, 'showError');

      const urlVal = urlRes.exists ? urlRes.value : undefined;
      const methodVal = methodRes.exists ? methodRes.value : undefined;
      const bodyVal = bodyRes.exists ? bodyRes.value : undefined;
      const headersVal = headersRes.exists ? headersRes.value : undefined;
      const paramsVal = paramsRes.exists ? paramsRes.value : undefined;
      const resultToVal = resultToRes.exists ? resultToRes.value : undefined;
      const onSuccessVal = onSuccessRes.exists ? onSuccessRes.value : undefined;
      const onErrorVal = onErrorRes.exists ? onErrorRes.value : undefined;
      const showErrorVal = showErrorRes.exists ? showErrorRes.value : undefined;

      if (!urlRes.exists) {
        pushActionIssue(context, {
          code: 'ACTION_URL_REQUIRED',
          path: [...path, 'url'],
          message: 'apiCall action requires "url"',
        });
      } else {
        inspectAndSanitizeJsonValue(urlVal, [...path, 'url'], 0, context.inspectionContext);
      }
      if (
        methodRes.exists &&
        methodVal !== undefined &&
        !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodVal as string)
      ) {
        pushActionIssue(context, {
          code: 'INVALID_HTTP_METHOD',
          path: [...path, 'method'],
          message: 'apiCall "method" must be GET, POST, PUT, DELETE, or PATCH',
        });
      }
      if (bodyRes.exists) {
        inspectAndSanitizeJsonValue(bodyVal, [...path, 'body'], 0, context.inspectionContext);
      }
      if (headersRes.exists) {
        if (!headersVal || typeof headersVal !== 'object' || Array.isArray(headersVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'headers'],
            message: 'apiCall "headers" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(
            headersVal,
            [...path, 'headers'],
            0,
            context.inspectionContext,
          );
        }
      }
      if (paramsRes.exists) {
        if (!paramsVal || typeof paramsVal !== 'object' || Array.isArray(paramsVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'params'],
            message: 'apiCall "params" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(paramsVal, [...path, 'params'], 0, context.inspectionContext);
        }
      }
      if (
        resultToRes.exists &&
        resultToVal !== undefined &&
        (typeof resultToVal !== 'string' || !resultToVal.trim())
      ) {
        pushActionIssue(context, {
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'resultTo'],
          message: 'apiCall "resultTo" must be a non-empty string if provided',
        });
      } else if (resultToRes.exists && resultToVal !== undefined) {
        validateLogicTarget(resultToVal, [...path, 'resultTo'], context);
      }
      if (onSuccessRes.exists) {
        if (!Array.isArray(onSuccessVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onSuccess'],
            message: 'apiCall "onSuccess" must be an array of actions if provided',
          });
        } else {
          validateActionList(onSuccessVal, [...path, 'onSuccess'], depth + 1, context);
        }
      }
      if (onErrorRes.exists) {
        if (!Array.isArray(onErrorVal)) {
          pushActionIssue(context, {
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onError'],
            message: 'apiCall "onError" must be an array of actions if provided',
          });
        } else {
          validateActionList(onErrorVal, [...path, 'onError'], depth + 1, context);
        }
      }
      if (showErrorRes.exists && showErrorVal !== undefined && typeof showErrorVal !== 'boolean') {
        pushActionIssue(context, {
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'showError'],
          message: 'apiCall "showError" must be a boolean if provided',
        });
      }
      break;
    }

    default: {
      pushActionIssue(context, {
        code: 'UNSUPPORTED_ACTION_TYPE',
        path: [...path, 'type'],
        message: `Unsupported action type: ${describeValue(type)}`,
      });
    }
  }
}
