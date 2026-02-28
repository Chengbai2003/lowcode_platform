import type { Value } from "../context";

/**
 * 数据操作 Actions
 */
export type SetFieldAction = {
  type: "setField";
  /** 字段名，支持路径如 'user.name' */
  field: string;
  /** 要设置的值 */
  value: Value;
};

export type MergeFieldAction = {
  type: "mergeField";
  /** 字段名 */
  field: string;
  /** 要合并的值 */
  value: Record<string, any>;
};

export type ClearFieldAction = {
  type: "clearField";
  /** 字段名 */
  field: string;
};
