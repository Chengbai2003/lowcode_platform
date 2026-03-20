export interface BackendPropertyMeta {
  readonly key: string;
  readonly label: string;
  readonly type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'expression';
  readonly defaultValue?: unknown;
}

export interface BackendComponentMeta {
  readonly type: string;
  readonly displayName: string;
  readonly category: 'layout' | 'form' | 'display' | 'feedback' | 'typography' | 'other';
  readonly isContainer: boolean;
  readonly textProps: readonly string[];
  readonly properties: readonly BackendPropertyMeta[];
}
