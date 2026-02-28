import type { Value } from "../context";

/**
 * 调试 Actions
 */
export type LogAction = {
  type: "log";
  value: Value;
  level?: "log" | "info" | "warn" | "error";
};

export type DebugAction = {
  type: "debug";
  label?: string;
};
