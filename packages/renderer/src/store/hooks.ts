import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState, AppDispatch } from './index';

// 使用类型化的 hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector);
export const useAppStore = () => useStore<RootState>();