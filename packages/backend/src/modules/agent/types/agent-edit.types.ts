import { EditorPatchOperation } from '../../agent-tools/types/editor-patch.types';
import { FocusContextResult } from '../../schema-context/types/focus-context.types';

export type AgentResponseMode = 'auto' | 'schema' | 'patch';
export type ResolvedAgentMode = 'schema' | 'patch';
export type AgentRouteReason =
  | 'manual_schema'
  | 'manual_patch'
  | 'missing_page_context'
  | 'whole_page_generation_intent'
  | 'selected_target'
  | 'candidate_target'
  | 'default_edit_with_page_context';

export interface AgentRouteInfo {
  requestedMode: AgentResponseMode;
  resolvedMode: ResolvedAgentMode;
  reason: AgentRouteReason;
  manualOverride: boolean;
}

export interface AgentRouteDecision {
  traceId: string;
  route: AgentRouteInfo;
  prefetchedFocusContext?: FocusContextResult;
  requestedPageId?: string;
}

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
  route: AgentRouteInfo;
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
  route: AgentRouteInfo;
}

export type AgentEditResponse = AgentEditSchemaResponse | AgentEditPatchResponse;
