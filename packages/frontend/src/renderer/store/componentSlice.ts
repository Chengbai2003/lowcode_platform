import type { Reducer } from '@reduxjs/toolkit';
import {
  COMPONENT_SET_CONFIG,
  COMPONENT_SET_DATA,
  COMPONENT_SET_MULTIPLE_DATA,
  setCompatibilityComponentConfig,
  setCompatibilityComponentData,
  setCompatibilityMultipleComponentData,
} from './compat';

const COMPONENT_CLEAR_DATA = 'components/clearComponentData';
const COMPONENT_RESET_ALL_DATA = 'components/resetAllData';

/**
 * 兼容层状态结构。
 * Renderer 主链已迁移到 ReactiveRuntime，这里的 store 仅服务遗留调用方。
 */
export interface ComponentState {
  data: Record<string, any>;
  config: Record<string, any>;
}

const initialState: ComponentState = {
  data: {},
  config: {},
};

export const setComponentData = setCompatibilityComponentData;
export const setMultipleComponentData = setCompatibilityMultipleComponentData;
export const setComponentConfig = setCompatibilityComponentConfig;

export function clearComponentData(id: string) {
  return {
    type: COMPONENT_CLEAR_DATA,
    payload: id,
  };
}

export function resetAllData() {
  return {
    type: COMPONENT_RESET_ALL_DATA,
  };
}

const componentReducer: Reducer<ComponentState> = (state = initialState, action) => {
  switch (action.type) {
    case COMPONENT_SET_DATA: {
      const { id, value } = action.payload as { id: string; value: any };
      return {
        ...state,
        data: { ...state.data, [id]: value },
      };
    }
    case COMPONENT_SET_MULTIPLE_DATA:
      return {
        ...state,
        data: { ...state.data, ...(action.payload as Record<string, any>) },
      };
    case COMPONENT_SET_CONFIG: {
      const { id, config } = action.payload as { id: string; config: any };
      return {
        ...state,
        config: {
          ...state.config,
          [id]: { ...state.config[id], ...config },
        },
      };
    }
    case COMPONENT_CLEAR_DATA: {
      const nextData = { ...state.data };
      delete nextData[action.payload as string];
      return {
        ...state,
        data: nextData,
      };
    }
    case COMPONENT_RESET_ALL_DATA:
      return initialState;
    default:
      return state;
  }
};

export default componentReducer;
