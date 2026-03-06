import type { Value } from "../context";

/**
 * 调试 Actions
 */

/**
 * 日志 Action
 */
export type LogAction = {
  type: "log";
  /** 要输出的值 */
  value: Value;
  /** 日志级别 */
  level?: "log" | "info" | "warn" | "error";
};
