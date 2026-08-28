import type { SchemaContractIssue } from './issues';
import type { InspectionContext } from './inspector';
import { inspectAndSanitizeJsonValue } from './inspector';

export interface ActionValidationContext {
  readonly issues: SchemaContractIssue[];
  readonly inspectionContext: InspectionContext;
  readonly maxActionNodes: number;
  readonly maxActionDepth: number;
  actionCount: number;
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

function checkUnknownActionFields(
  typedAction: Record<string, unknown>,
  allowedFields: readonly string[],
  path: readonly (string | number)[],
  issues: SchemaContractIssue[],
): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(typedAction)) {
    if (!allowed.has(key)) {
      issues.push({
        code: 'UNKNOWN_ACTION_FIELD',
        path: [...path, key],
        message: `Unknown field "${key}" on action of type "${String(typedAction.type)}"`,
      });
    }
  }
}

export function validateActionList(
  actions: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: ActionValidationContext,
): void {
  if (!Array.isArray(actions)) {
    context.issues.push({
      code: 'INVALID_ACTION_LIST',
      path,
      message: 'Action list must be an array',
    });
    return;
  }

  if (depth > context.maxActionDepth) {
    context.issues.push({
      code: 'ACTION_DEPTH_EXCEEDED',
      path,
      message: `Action nesting depth exceeded limit of ${context.maxActionDepth}`,
    });
    return;
  }

  for (let i = 0; i < actions.length; i++) {
    validateActionItem(actions[i], [...path, i], depth, context);
  }
}

export function validateActionItem(
  action: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: ActionValidationContext,
): void {
  context.actionCount++;
  if (context.actionCount > context.maxActionNodes) {
    context.issues.push({
      code: 'ACTION_BUDGET_EXCEEDED',
      path,
      message: `Total action count exceeded limit of ${context.maxActionNodes}`,
    });
    return;
  }

  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    context.issues.push({
      code: 'INVALID_ACTION_OBJECT',
      path,
      message: 'Each action must be an object',
    });
    return;
  }

  const descriptors = Object.getOwnPropertyDescriptors(action);
  for (const [key, desc] of Object.entries(descriptors)) {
    if (desc.get || desc.set) {
      context.issues.push({
        code: 'ACCESSOR_PROPERTY_FORBIDDEN',
        path: [...path, key],
        message: `Action property "${key}" must not be an accessor (getter/setter)`,
      });
      return;
    }
  }

  const typedAction = action as Record<string, unknown>;
  const type = typedAction.type;

  if (typeof type !== 'string' || !type.trim()) {
    context.issues.push({
      code: 'ACTION_TYPE_REQUIRED',
      path: [...path, 'type'],
      message: 'Action type is required',
    });
    return;
  }

  if (type === 'customScript') {
    context.issues.push({
      code: 'FORBIDDEN_CUSTOM_SCRIPT',
      path: [...path, 'type'],
      message: 'customScript is permanently forbidden in PageSchema',
    });
    return;
  }

  switch (type) {
    case 'setValue': {
      checkUnknownActionFields(
        typedAction,
        ['type', 'field', 'value', 'merge'],
        path,
        context.issues,
      );
      if (typeof typedAction.field !== 'string' || !typedAction.field.trim()) {
        context.issues.push({
          code: 'ACTION_FIELD_REQUIRED',
          path: [...path, 'field'],
          message: 'setValue action requires a non-empty string "field"',
        });
      }
      if (typedAction.value === undefined) {
        context.issues.push({
          code: 'ACTION_VALUE_REQUIRED',
          path: [...path, 'value'],
          message: 'setValue action requires "value"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.value,
          [...path, 'value'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.merge !== undefined && typeof typedAction.merge !== 'boolean') {
        context.issues.push({
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'merge'],
          message: 'setValue "merge" must be a boolean if provided',
        });
      }
      break;
    }

    case 'if': {
      checkUnknownActionFields(
        typedAction,
        ['type', 'condition', 'then', 'else'],
        path,
        context.issues,
      );
      if (typedAction.condition === undefined) {
        context.issues.push({
          code: 'ACTION_CONDITION_REQUIRED',
          path: [...path, 'condition'],
          message: 'if action requires "condition"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.condition,
          [...path, 'condition'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.then === undefined || !Array.isArray(typedAction.then)) {
        context.issues.push({
          code: 'ACTION_THEN_REQUIRED',
          path: [...path, 'then'],
          message: 'if action requires "then" array of actions',
        });
      } else {
        validateActionList(typedAction.then, [...path, 'then'], depth + 1, context);
      }
      if (typedAction.else !== undefined) {
        if (!Array.isArray(typedAction.else)) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'else'],
            message: 'if "else" must be an array of actions if provided',
          });
        } else {
          validateActionList(typedAction.else, [...path, 'else'], depth + 1, context);
        }
      }
      break;
    }

    case 'loop': {
      checkUnknownActionFields(
        typedAction,
        ['type', 'over', 'itemVar', 'indexVar', 'actions'],
        path,
        context.issues,
      );
      if (typedAction.over === undefined) {
        context.issues.push({
          code: 'ACTION_OVER_REQUIRED',
          path: [...path, 'over'],
          message: 'loop action requires "over" target',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.over,
          [...path, 'over'],
          0,
          context.inspectionContext,
        );
      }
      if (!isSafeIdentifier(typedAction.itemVar)) {
        context.issues.push({
          code: 'INVALID_LOOP_IDENTIFIER',
          path: [...path, 'itemVar'],
          message: `loop itemVar must be a valid, safe identifier, received: "${String(typedAction.itemVar)}"`,
        });
      }
      if (typedAction.indexVar !== undefined) {
        if (!isSafeIdentifier(typedAction.indexVar)) {
          context.issues.push({
            code: 'INVALID_LOOP_IDENTIFIER',
            path: [...path, 'indexVar'],
            message: `loop indexVar must be a valid, safe identifier, received: "${String(typedAction.indexVar)}"`,
          });
        } else if (typedAction.itemVar === typedAction.indexVar) {
          context.issues.push({
            code: 'LOOP_VAR_COLLISION',
            path: [...path, 'indexVar'],
            message: `loop indexVar cannot be identical to itemVar: "${String(typedAction.itemVar)}"`,
          });
        }
      }
      if (typedAction.actions === undefined || !Array.isArray(typedAction.actions)) {
        context.issues.push({
          code: 'ACTION_ACTIONS_REQUIRED',
          path: [...path, 'actions'],
          message: 'loop action requires "actions" array',
        });
      } else {
        validateActionList(typedAction.actions, [...path, 'actions'], depth + 1, context);
      }
      break;
    }

    case 'navigate': {
      checkUnknownActionFields(
        typedAction,
        ['type', 'to', 'params', 'replace'],
        path,
        context.issues,
      );
      if (typedAction.to === undefined) {
        context.issues.push({
          code: 'ACTION_TO_REQUIRED',
          path: [...path, 'to'],
          message: 'navigate action requires "to" destination',
        });
      } else {
        inspectAndSanitizeJsonValue(typedAction.to, [...path, 'to'], 0, context.inspectionContext);
      }
      if (typedAction.params !== undefined) {
        if (
          !typedAction.params ||
          typeof typedAction.params !== 'object' ||
          Array.isArray(typedAction.params)
        ) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'params'],
            message: 'navigate "params" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(
            typedAction.params,
            [...path, 'params'],
            0,
            context.inspectionContext,
          );
        }
      }
      if (typedAction.replace !== undefined && typeof typedAction.replace !== 'boolean') {
        context.issues.push({
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'replace'],
          message: 'navigate "replace" must be a boolean if provided',
        });
      }
      break;
    }

    case 'delay': {
      checkUnknownActionFields(typedAction, ['type', 'ms'], path, context.issues);
      if (typedAction.ms !== undefined) {
        if (
          typeof typedAction.ms !== 'number' ||
          !Number.isFinite(typedAction.ms) ||
          typedAction.ms < 0
        ) {
          context.issues.push({
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
        typedAction,
        ['type', 'kind', 'content', 'title', 'level', 'placement', 'duration'],
        path,
        context.issues,
      );
      if (
        typedAction.kind !== undefined &&
        typedAction.kind !== 'message' &&
        typedAction.kind !== 'notification'
      ) {
        context.issues.push({
          code: 'INVALID_FEEDBACK_KIND',
          path: [...path, 'kind'],
          message: 'feedback "kind" must be "message" or "notification"',
        });
      }
      if (typedAction.content === undefined) {
        context.issues.push({
          code: 'ACTION_CONTENT_REQUIRED',
          path: [...path, 'content'],
          message: 'feedback action requires "content"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.content,
          [...path, 'content'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.title !== undefined) {
        inspectAndSanitizeJsonValue(
          typedAction.title,
          [...path, 'title'],
          0,
          context.inspectionContext,
        );
      }
      if (
        typedAction.level !== undefined &&
        !['success', 'error', 'warning', 'info'].includes(typedAction.level as string)
      ) {
        context.issues.push({
          code: 'INVALID_FEEDBACK_LEVEL',
          path: [...path, 'level'],
          message: 'feedback "level" must be "success", "error", "warning", or "info"',
        });
      }
      if (
        typedAction.placement !== undefined &&
        !['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(
          typedAction.placement as string,
        )
      ) {
        context.issues.push({
          code: 'INVALID_FEEDBACK_PLACEMENT',
          path: [...path, 'placement'],
          message:
            'feedback "placement" must be "topLeft", "topRight", "bottomLeft", or "bottomRight"',
        });
      }
      if (
        typedAction.duration !== undefined &&
        (typeof typedAction.duration !== 'number' ||
          !Number.isFinite(typedAction.duration) ||
          typedAction.duration < 0)
      ) {
        context.issues.push({
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'duration'],
          message: 'feedback "duration" must be a non-negative finite number',
        });
      }
      break;
    }

    case 'dialog': {
      checkUnknownActionFields(
        typedAction,
        ['type', 'kind', 'title', 'content', 'onOk', 'onCancel'],
        path,
        context.issues,
      );
      if (typedAction.kind !== 'modal' && typedAction.kind !== 'confirm') {
        context.issues.push({
          code: 'INVALID_DIALOG_KIND',
          path: [...path, 'kind'],
          message: 'dialog "kind" is required and must be "modal" or "confirm"',
        });
      }
      if (typedAction.content === undefined) {
        context.issues.push({
          code: 'ACTION_CONTENT_REQUIRED',
          path: [...path, 'content'],
          message: 'dialog action requires "content"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.content,
          [...path, 'content'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.title !== undefined) {
        inspectAndSanitizeJsonValue(
          typedAction.title,
          [...path, 'title'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.onOk !== undefined) {
        if (!Array.isArray(typedAction.onOk)) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onOk'],
            message: 'dialog "onOk" must be an array of actions if provided',
          });
        } else {
          validateActionList(typedAction.onOk, [...path, 'onOk'], depth + 1, context);
        }
      }
      if (typedAction.onCancel !== undefined) {
        if (!Array.isArray(typedAction.onCancel)) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onCancel'],
            message: 'dialog "onCancel" must be an array of actions if provided',
          });
        } else {
          validateActionList(typedAction.onCancel, [...path, 'onCancel'], depth + 1, context);
        }
      }
      break;
    }

    case 'log': {
      checkUnknownActionFields(typedAction, ['type', 'value', 'level'], path, context.issues);
      if (typedAction.value === undefined) {
        context.issues.push({
          code: 'ACTION_VALUE_REQUIRED',
          path: [...path, 'value'],
          message: 'log action requires "value"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.value,
          [...path, 'value'],
          0,
          context.inspectionContext,
        );
      }
      if (
        typedAction.level !== undefined &&
        !['log', 'info', 'warn', 'error'].includes(typedAction.level as string)
      ) {
        context.issues.push({
          code: 'INVALID_LOG_LEVEL',
          path: [...path, 'level'],
          message: 'log "level" must be "log", "info", "warn", or "error"',
        });
      }
      break;
    }

    case 'apiCall': {
      checkUnknownActionFields(
        typedAction,
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
        context.issues,
      );
      if (typedAction.url === undefined) {
        context.issues.push({
          code: 'ACTION_URL_REQUIRED',
          path: [...path, 'url'],
          message: 'apiCall action requires "url"',
        });
      } else {
        inspectAndSanitizeJsonValue(
          typedAction.url,
          [...path, 'url'],
          0,
          context.inspectionContext,
        );
      }
      if (
        typedAction.method !== undefined &&
        !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(typedAction.method as string)
      ) {
        context.issues.push({
          code: 'INVALID_HTTP_METHOD',
          path: [...path, 'method'],
          message: 'apiCall "method" must be GET, POST, PUT, DELETE, or PATCH',
        });
      }
      if (typedAction.body !== undefined) {
        inspectAndSanitizeJsonValue(
          typedAction.body,
          [...path, 'body'],
          0,
          context.inspectionContext,
        );
      }
      if (typedAction.headers !== undefined) {
        if (
          !typedAction.headers ||
          typeof typedAction.headers !== 'object' ||
          Array.isArray(typedAction.headers)
        ) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'headers'],
            message: 'apiCall "headers" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(
            typedAction.headers,
            [...path, 'headers'],
            0,
            context.inspectionContext,
          );
        }
      }
      if (typedAction.params !== undefined) {
        if (
          !typedAction.params ||
          typeof typedAction.params !== 'object' ||
          Array.isArray(typedAction.params)
        ) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'params'],
            message: 'apiCall "params" must be an object if provided',
          });
        } else {
          inspectAndSanitizeJsonValue(
            typedAction.params,
            [...path, 'params'],
            0,
            context.inspectionContext,
          );
        }
      }
      if (
        typedAction.resultTo !== undefined &&
        (typeof typedAction.resultTo !== 'string' || !typedAction.resultTo.trim())
      ) {
        context.issues.push({
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'resultTo'],
          message: 'apiCall "resultTo" must be a non-empty string if provided',
        });
      }
      if (typedAction.onSuccess !== undefined) {
        if (!Array.isArray(typedAction.onSuccess)) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onSuccess'],
            message: 'apiCall "onSuccess" must be an array of actions if provided',
          });
        } else {
          validateActionList(typedAction.onSuccess, [...path, 'onSuccess'], depth + 1, context);
        }
      }
      if (typedAction.onError !== undefined) {
        if (!Array.isArray(typedAction.onError)) {
          context.issues.push({
            code: 'INVALID_ACTION_FIELD_TYPE',
            path: [...path, 'onError'],
            message: 'apiCall "onError" must be an array of actions if provided',
          });
        } else {
          validateActionList(typedAction.onError, [...path, 'onError'], depth + 1, context);
        }
      }
      if (typedAction.showError !== undefined && typeof typedAction.showError !== 'boolean') {
        context.issues.push({
          code: 'INVALID_ACTION_FIELD_TYPE',
          path: [...path, 'showError'],
          message: 'apiCall "showError" must be a boolean if provided',
        });
      }
      break;
    }

    default: {
      context.issues.push({
        code: 'UNSUPPORTED_ACTION_TYPE',
        path: [...path, 'type'],
        message: `Unsupported action type: "${String(type)}"`,
      });
    }
  }
}
