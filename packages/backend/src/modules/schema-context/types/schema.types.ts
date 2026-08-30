export interface A2UIComponent {
  readonly id: string;
  readonly type: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly childrenIds?: readonly string[];
  readonly events?: Readonly<Record<string, unknown>>;
}

export interface A2UISchema {
  /** DSL 格式版本（M0 固定 0）；页面内容修订版本不在此对象内 */
  readonly schemaVersion: number;
  readonly rootId: string;
  readonly components: Readonly<Record<string, A2UIComponent>>;
}
