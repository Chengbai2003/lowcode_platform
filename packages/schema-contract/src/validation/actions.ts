import { isCoreActionType } from '../actions/action-union';
import type { SchemaContractIssue } from './issues';

const NESTED_ACTION_KEYS = [
  'then',
  'else',
  'actions',
  'onSuccess',
  'onError',
  'onOk',
  'onCancel',
] as const;

export function validateActionList(
  actions: unknown,
  path: readonly (string | number)[],
  issues: SchemaContractIssue[],
): void {
  if (!Array.isArray(actions)) {
    issues.push({
      code: 'INVALID_ACTION_LIST',
      path,
      message: 'Action list must be an array',
    });
    return;
  }

  for (let i = 0; i < actions.length; i++) {
    validateActionItem(actions[i], [...path, i], issues);
  }
}

export function validateActionItem(
  action: unknown,
  path: readonly (string | number)[],
  issues: SchemaContractIssue[],
): void {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    issues.push({
      code: 'INVALID_ACTION_OBJECT',
      path,
      message: 'Each action must be an object',
    });
    return;
  }

  const typedAction = action as Record<string, unknown>;
  const type = typedAction.type;

  if (typeof type !== 'string' || !type.trim()) {
    issues.push({
      code: 'ACTION_TYPE_REQUIRED',
      path: [...path, 'type'],
      message: 'Action type is required',
    });
    return;
  }

  if (type === 'customScript') {
    issues.push({
      code: 'FORBIDDEN_CUSTOM_SCRIPT',
      path: [...path, 'type'],
      message: 'customScript is permanently forbidden in PageSchema',
    });
    return;
  }

  if (!isCoreActionType(type)) {
    issues.push({
      code: 'UNSUPPORTED_ACTION_TYPE',
      path: [...path, 'type'],
      message: `Unsupported action type: "${type}"`,
    });
    return;
  }

  for (const key of NESTED_ACTION_KEYS) {
    const nested = typedAction[key];
    if (nested !== undefined) {
      validateActionList(nested, [...path, key], issues);
    }
  }
}

export function hasCustomScriptInValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some(hasCustomScriptInValue);
  }
  const record = value as Record<string, unknown>;
  return record.type === 'customScript' || Object.values(record).some(hasCustomScriptInValue);
}
