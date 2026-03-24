export interface EditorAction {
  type: string;
  [key: string]: unknown;
}

export type EditorActionList = EditorAction[];
