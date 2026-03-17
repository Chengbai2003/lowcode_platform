export const COMPONENT_SET_DATA = 'components/setComponentData';
export const COMPONENT_SET_MULTIPLE_DATA = 'components/setMultipleComponentData';
export const COMPONENT_SET_CONFIG = 'components/setComponentConfig';

export interface CompatibilityComponentDataAction {
  type: typeof COMPONENT_SET_DATA;
  payload: { id: string; value: any };
}

export interface CompatibilityMultipleComponentDataAction {
  type: typeof COMPONENT_SET_MULTIPLE_DATA;
  payload: Record<string, any>;
}

export interface CompatibilityComponentConfigAction {
  type: typeof COMPONENT_SET_CONFIG;
  payload: { id: string; config: any };
}

export function setCompatibilityComponentData(payload: {
  id: string;
  value: any;
}): CompatibilityComponentDataAction {
  return {
    type: COMPONENT_SET_DATA,
    payload,
  };
}

export function setCompatibilityMultipleComponentData(
  payload: Record<string, any>,
): CompatibilityMultipleComponentDataAction {
  return {
    type: COMPONENT_SET_MULTIPLE_DATA,
    payload,
  };
}

export function setCompatibilityComponentConfig(payload: {
  id: string;
  config: any;
}): CompatibilityComponentConfigAction {
  return {
    type: COMPONENT_SET_CONFIG,
    payload,
  };
}

export function selectCompatibilityComponentData(state: any): Record<string, unknown> | undefined {
  return state?.components?.data;
}
