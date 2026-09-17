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
  /**
   * 显式声明的 Props 写入白名单（Issue #39 / M1F-2 B4 起 opt-in）。
   * 声明后，Agent 写入路径（insertComponent / updateProps）按此集合拒绝
   * 未知 Props；未声明（如内置 AntD Meta）保持既有宽松行为，零行为变化。
   * 取值应与对应 Preset 包的 Manifest allowedProps 完全一致。
   */
  readonly allowedProps?: readonly string[];
}
