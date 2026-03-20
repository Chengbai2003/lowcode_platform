export interface A2UIComponent {
  readonly id: string;
  readonly type: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly childrenIds?: readonly string[];
  readonly events?: Readonly<Record<string, unknown>>;
}

export interface A2UISchema {
  readonly version?: number;
  readonly rootId: string;
  readonly components: Readonly<Record<string, A2UIComponent>>;
}
