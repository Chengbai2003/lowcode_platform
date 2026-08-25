import { getCoreActionTypes } from '../ai/prompt-builder';

const NESTED_ACTION_KEYS = ['then', 'else', 'actions', 'onSuccess', 'onError', 'onOk', 'onCancel'];
const allowedActionTypes = new Set(getCoreActionTypes().filter((type) => type !== 'customScript'));

export function getActionValidationError(actions: unknown): string | undefined {
  if (!Array.isArray(actions)) {
    return 'Action list must be an array';
  }

  for (const action of actions) {
    const error = getActionError(action);
    if (error) return error;
  }
}

function getActionError(action: unknown): string | undefined {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return 'Each action must be an object';
  }

  const typedAction = action as Record<string, unknown>;
  if (typeof typedAction.type !== 'string' || !typedAction.type.trim()) {
    return 'Action type is required';
  }
  if (typedAction.type === 'customScript') {
    return 'customScript is not allowed in schema';
  }
  if (!allowedActionTypes.has(typedAction.type)) {
    return `Unsupported action type ${typedAction.type}`;
  }

  for (const key of NESTED_ACTION_KEYS) {
    const nestedActions = typedAction[key];
    if (nestedActions === undefined) continue;
    if (!Array.isArray(nestedActions)) {
      return `Action field ${key} must be an array`;
    }
    const error = getActionValidationError(nestedActions);
    if (error) return error;
  }
}

export function hasCustomScriptInValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasCustomScriptInValue);

  const record = value as Record<string, unknown>;
  return record.type === 'customScript' || Object.values(record).some(hasCustomScriptInValue);
}
