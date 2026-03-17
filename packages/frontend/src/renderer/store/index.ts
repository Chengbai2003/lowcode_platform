import { configureStore } from '@reduxjs/toolkit';
import componentReducer from './componentSlice';

/**
 * Redux 兼容层 store。
 * Renderer 主链已不依赖它，仅保留给遗留接入方。
 */
export const store = configureStore({
  reducer: {
    components: componentReducer,
  },
});

// 导出类型
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
