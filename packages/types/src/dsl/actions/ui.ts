import type { Action } from "../action-union";
import type { Value } from "../context";

/**
 * UI交互 Actions
 */
export type MessageAction = {
  type: "message";
  content: Value;
  messageType?: "success" | "error" | "warning" | "info";
  duration?: number;
};

export type ModalAction = {
  type: "modal";
  title: Value;
  content: Value;
  onOk?: Action[];
  onCancel?: Action[];
  showCancel?: boolean;
};

export type ConfirmAction = {
  type: "confirm";
  title?: Value;
  content: Value;
  onOk?: Action[];
  onCancel?: Action[];
};

export type NotificationAction = {
  type: "notification";
  title: Value;
  description?: Value;
  messageType?: "success" | "error" | "warning" | "info";
  duration?: number;
  placement?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
};
