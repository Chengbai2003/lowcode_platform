import type { Action } from '../action-union';
import type { Value } from '../context';

/**
 * 异步操作 Actions
 */

/**
 * API 调用 Action
 */
export type ApiCallAction = {
  type: 'apiCall';
  /** 请求 URL */
  url: Value;
  /** 请求方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求体 */
  body?: Value;
  /** 请求头 */
  headers?: Record<string, Value>;
  /** URL 参数 */
  params?: Record<string, Value>;
  /** 响应结果存储字段 */
  resultTo?: string;
  /** 成功回调 */
  onSuccess?: Action[];
  /** 失败回调 */
  onError?: Action[];
  /** 是否自动显示错误信息 */
  showError?: boolean;
};

/**
 * 延迟 Action
 */
export type DelayAction = {
  type: 'delay';
  /** 延迟时间(ms) */
  ms?: number;
};
