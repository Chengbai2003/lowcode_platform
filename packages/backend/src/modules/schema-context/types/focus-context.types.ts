import { A2UIComponent, A2UISchema } from './schema.types';

export interface AncestorEntry {
  readonly id: string;
  readonly type: string;
  readonly depth: number;
}

export interface SiblingInfo {
  readonly id: string;
  readonly type: string;
  readonly index: number;
}

export interface NodeSummary {
  readonly id: string;
  readonly type: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly childrenIds?: readonly string[];
  readonly events?: Readonly<Record<string, unknown>>;
}

export interface SchemaStats {
  readonly totalComponents: number;
  readonly maxDepth: number;
  readonly rootId: string;
  readonly version?: number;
}

export interface FocusContext {
  readonly focusNode: NodeSummary;
  readonly parent: NodeSummary | null;
  readonly ancestors: readonly AncestorEntry[];
  readonly children: readonly NodeSummary[];
  readonly siblings: readonly SiblingInfo[];
  readonly subtree: Readonly<Record<string, A2UIComponent>>;
  readonly schemaStats: SchemaStats;
  readonly estimatedTokens: number;
}

export interface NodeCandidate {
  readonly id: string;
  readonly type: string;
  readonly score: number;
  readonly reason: string;
  readonly matchType: 'id' | 'type' | 'prop_value' | 'display_name' | 'keyword';
}

export interface FocusContextResult {
  readonly mode: 'focused' | 'candidates';
  readonly context?: FocusContext;
  readonly candidates?: readonly NodeCandidate[];
  readonly schema: A2UISchema;
  readonly componentList: readonly string[];
}
