import type { Action } from "../action-union";
import type { Value } from "../context";

/**
 * 异步操作 Actions
 */
export type ApiCallAction = {
  type: "apiCall";
  url: Value;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: Value;
  headers?: Record<string, Value>;
  params?: Record<string, Value>;
  resultTo?: string;
  onSuccess?: Action[];
  onError?: Action[];
  showError?: boolean;
};

export type DelayAction = {
  type: "delay";
  ms: number;
};

export type WaitConditionAction = {
  type: "waitCondition";
  condition: Value;
  interval?: number;
  timeout?: number;
  onTimeout?: Action[];
};
