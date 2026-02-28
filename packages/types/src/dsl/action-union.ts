import type {
  SetFieldAction,
  MergeFieldAction,
  ClearFieldAction,
} from "./actions/data";
import type {
  MessageAction,
  ModalAction,
  ConfirmAction,
  NotificationAction,
} from "./actions/ui";
import type {
  NavigateAction,
  OpenTabAction,
  CloseTabAction,
  BackAction,
} from "./actions/navigation";
import type {
  DispatchAction,
  SetStateAction,
  ResetFormAction,
} from "./actions/state";
import type {
  ApiCallAction,
  DelayAction,
  WaitConditionAction,
} from "./actions/async";
import type {
  IfAction,
  SwitchAction,
  LoopAction,
  ParallelAction,
  SequenceAction,
  TryCatchAction,
} from "./actions/flow";
import type { LogAction, DebugAction } from "./actions/debug";
import type { CustomScriptAction, CustomAction } from "./actions/extension";

/**
 * 所有支持的Action类型
 */
export type Action =
  | SetFieldAction
  | MergeFieldAction
  | ClearFieldAction
  | MessageAction
  | ModalAction
  | ConfirmAction
  | NotificationAction
  | NavigateAction
  | OpenTabAction
  | CloseTabAction
  | BackAction
  | DispatchAction
  | SetStateAction
  | ResetFormAction
  | ApiCallAction
  | DelayAction
  | WaitConditionAction
  | IfAction
  | SwitchAction
  | LoopAction
  | ParallelAction
  | SequenceAction
  | TryCatchAction
  | LogAction
  | DebugAction
  | CustomScriptAction
  | CustomAction;

/**
 * Action列表
 */
export type ActionList = Action[];

/**
 * 事件定义
 */
export type EventDefinition = ActionList;

/**
 * 事件映射
 */
export type EventsMap = Record<string, EventDefinition>;
