export type ActionList = unknown[];

export type EventConfig = Record<string, ActionList>;

export interface A2UIComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds?: string[];
  events?: EventConfig;
}

export interface A2UISchema {
  /** DSL 格式版本（M0 固定 0）；页面内容修订版本不在此对象内 */
  schemaVersion: number;
  rootId: string;
  components: Record<string, A2UIComponent>;
}
