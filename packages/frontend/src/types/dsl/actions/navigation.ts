import type { Value } from '../context';

/**
 * 导航 Actions
 */
export type NavigateAction = {
  type: 'navigate';
  /** 目标路径 */
  to: Value;
  /** 路径参数 */
  params?: Record<string, Value>;
  /** 是否替换当前历史记录 */
  replace?: boolean;
};
