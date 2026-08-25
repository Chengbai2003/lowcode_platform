import type { JsonValue } from '../types/json';

/**
 * 页面跳转 Action
 */
export interface NavigateAction {
  readonly type: 'navigate';
  /** 目标路径，仅允许站内相对路径 */
  readonly to: JsonValue;
  /** 路径/查询参数 */
  readonly params?: Readonly<Record<string, JsonValue>>;
  /** 是否替换当前历史记录 */
  readonly replace?: boolean;
}
