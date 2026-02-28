import type { Action } from "../action-union";
import type { Value } from "../context";

/**
 * 流程控制 Actions
 */
export type IfAction = {
  type: "if";
  condition: Value;
  then: Action[];
  else?: Action[];
};

export type SwitchAction = {
  type: "switch";
  value: Value;
  cases: Array<{
    match: Value;
    actions: Action[];
  }>;
  default?: Action[];
};

export type LoopAction = {
  type: "loop";
  over: Value;
  itemVar: string;
  indexVar?: string;
  actions: Action[];
};

export type ParallelAction = {
  type: "parallel";
  actions: Action[];
  waitAll?: boolean;
};

export type SequenceAction = {
  type: "sequence";
  actions: Action[];
};

export type TryCatchAction = {
  type: "tryCatch";
  try: Action[];
  catch: Action[];
  finally?: Action[];
};
