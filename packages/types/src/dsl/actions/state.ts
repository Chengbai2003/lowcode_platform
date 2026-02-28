import type { Value } from "../context";

/**
 * 状态管理 Actions
 */
export type DispatchAction = {
  type: "dispatch";
  action: Value;
};

export type SetStateAction = {
  type: "setState";
  state: Record<string, Value>;
};

export type ResetFormAction = {
  type: "resetForm";
  form: string;
};
