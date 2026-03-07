import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * 组件状态结构
 */
export interface ComponentState {
  /**
   * 业务数据 (Values)
   * Key: Component ID
   * Value: Component Value
   */
  data: Record<string, any>;
  
  /**
   * 配置数据 (Props/Config)
   * Key: Component ID
   * Value: Component Props
   */
  config: Record<string, any>;
}

const initialState: ComponentState = {
  data: {},
  config: {},
};

export const componentSlice = createSlice({
  name: 'components',
  initialState,
  reducers: {
    /**
     * 更新组件业务数据
     */
    setComponentData: (state, action: PayloadAction<{ id: string; value: any }>) => {
      const { id, value } = action.payload;
      state.data[id] = value;
    },

    /**
     * 批量更新组件业务数据
     */
    setMultipleComponentData: (state, action: PayloadAction<Record<string, any>>) => {
      state.data = { ...state.data, ...action.payload };
    },

    /**
     * 清除指定组件数据
     */
    clearComponentData: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      delete state.data[id];
    },

    /**
     * 更新组件配置
     */
    setComponentConfig: (state, action: PayloadAction<{ id: string; config: any }>) => {
      const { id, config } = action.payload;
      state.config[id] = { ...state.config[id], ...config };
    },

    /**
     * 重置所有数据
     */
    resetAllData: () => {
      return initialState;
    },
  },
});

export const {
  setComponentData,
  setMultipleComponentData,
  clearComponentData,
  setComponentConfig,
  resetAllData,
} = componentSlice.actions;

export default componentSlice.reducer;