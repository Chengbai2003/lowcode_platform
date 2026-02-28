import type { Value } from "../context";

/**
 * 导航 Actions
 */
export type NavigateAction = {
  type: "navigate";
  to: Value;
  params?: Record<string, Value>;
  replace?: boolean;
};

export type OpenTabAction = {
  type: "openTab";
  id: string;
  title: Value;
  path: Value;
  closeOthers?: boolean;
};

export type CloseTabAction = {
  type: "closeTab";
  id?: string;
};

export type BackAction = {
  type: "back";
  count?: number;
};
