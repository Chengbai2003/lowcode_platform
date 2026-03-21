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
  version?: number;
  rootId: string;
  components: Record<string, A2UIComponent>;
}
