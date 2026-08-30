import type { ActionList } from './action-union';
import type { JsonValue } from '../types/json';

/**
 * 接口调用 Action (M0 开发期兼容结构，M1b 升级为 DataSource)
 */
export interface ApiCallAction {
  readonly type: 'apiCall';
  /** 请求 URL */
  readonly url: JsonValue;
  /** 请求方法 */
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求体 */
  readonly body?: JsonValue;
  /** 请求头 */
  readonly headers?: Readonly<Record<string, JsonValue>>;
  /** URL 参数 */
  readonly params?: Readonly<Record<string, JsonValue>>;
  /** 响应结果存储字段 */
  readonly resultTo?: string;
  /** 成功回调 Actions */
  readonly onSuccess?: ActionList;
  /** 失败回调 Actions */
  readonly onError?: ActionList;
  /** 是否自动提示错误 */
  readonly showError?: boolean;
}

/**
 * 延迟等待 Action
 */
export interface DelayAction {
  readonly type: 'delay';
  /** 延迟毫秒数 */
  readonly ms?: number;
}
