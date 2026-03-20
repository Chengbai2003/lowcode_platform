import { EditorPatchOperation } from '../../agent-tools/types/editor-patch.types';

export type AgentResponseMode = 'schema' | 'patch';

export interface AgentUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentEditSchemaResponse {
  mode: 'schema';
  content: string;
  schema?: Record<string, unknown>;
  warnings: string[];
  usage?: AgentUsage;
  pageId?: string;
  version?: number;
  selectedId?: string;
  traceId: string;
}

export interface AgentEditPatchResponse {
  mode: 'patch';
  pageId?: string;
  baseVersion?: number;
  resolvedVersion?: number;
  resolvedSelectedId?: string;
  patch: EditorPatchOperation[];
  warnings: string[];
  traceId: string;
}

export type AgentEditResponse = AgentEditSchemaResponse | AgentEditPatchResponse;
