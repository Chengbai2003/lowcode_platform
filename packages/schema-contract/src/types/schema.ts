import type { ComponentNode } from './node';
import type { SupportedSchemaVersion } from './versions';

/**
 * 纯粹、可移植的 PageSchema 结构
 * 绝对不包含 pageVersion，只表达 DSL 结构
 */
export interface PageSchema {
  readonly schemaVersion: SupportedSchemaVersion;
  readonly rootId: string;
  readonly components: Readonly<Record<string, ComponentNode>>;
}
