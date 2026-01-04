import { configureStore } from '@reduxjs/toolkit';
import componentReducer from './componentSlice';

/**
 * Redux store 配置
 */
export const store = configureStore({
  reducer: {
    components: componentReducer,
  },
});

// 导出类型
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;