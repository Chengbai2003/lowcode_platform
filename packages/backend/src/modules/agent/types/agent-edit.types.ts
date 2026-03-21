import { EditorPatchOperation } from '../../agent-tools/types/editor-patch.types';
import { A2UISchema } from '../../schema-context/types/schema.types';
import { FocusContextResult } from '../../schema-context/types/focus-context.types';

export type AgentResponseMode = 'auto' | 'answer' | 'schema' | 'patch';
export type ResolvedAgentMode = 'answer' | 'schema' | 'patch';
export type AgentRouteReason =
  | 'manual_answer'
  | 'manual_schema'
  | 'manual_patch'
  | 'llm_intent_answer'
  | 'llm_intent_schema'
  | 'llm_intent_patch'
  | 'general_question_intent'
  | 'page_question_intent'
  | 'missing_page_context'
  | 'whole_page_generation_intent'
  | 'selected_target'
  | 'candidate_target'
  | 'default_edit_with_page_context';

export interface AgentIntentClassification {
  mode: ResolvedAgentMode;
  confidence: number;
  reason: string;
  needsPageContext: boolean;
  needsTargetResolution: boolean;
}

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

export interface AgentClarificationCandidate {
  id: string;
  type: string;
  score: number;
  reason: string;
  displayLabel: string;
  secondaryLabel: string;
  pathLabel?: string;
}

export interface AgentEditAnswerResponse {
  mode: 'answer';
  content: string;
  warnings: string[];
  usage?: AgentUsage;
  traceId: string;
  route: AgentRouteInfo;
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

export type AgentPatchRiskLevel = 'low' | 'medium' | 'high';
export type AgentPatchChangeKind = 'content' | 'props' | 'event' | 'structure';

export interface AgentPatchChangeEntry {
  op: EditorPatchOperation['op'];
  targetId: string;
  summary: string;
}

export interface AgentPatchChangeGroup {
  kind: AgentPatchChangeKind;
  label: string;
  count: number;
  entries: AgentPatchChangeEntry[];
}

export interface AgentPatchRiskAssessment {
  level: AgentPatchRiskLevel;
  reasons: string[];
  patchOps: number;
  distinctTargets: number;
  requiresConfirmation: boolean;
}

export interface AgentEditPatchResponse {
  mode: 'patch';
  pageId?: string;
  baseVersion?: number;
  resolvedVersion?: number;
  resolvedSelectedId?: string;
  patch: EditorPatchOperation[];
  previewSchema: A2UISchema;
  previewSummary: string;
  changeGroups: AgentPatchChangeGroup[];
  risk: AgentPatchRiskAssessment;
  requiresConfirmation: boolean;
  warnings: string[];
  traceId: string;
  route: AgentRouteInfo;
}

export interface AgentEditClarificationResponse {
  mode: 'clarification';
  content: string;
  question: string;
  clarificationId: string;
  candidates: AgentClarificationCandidate[];
  warnings: string[];
  traceId: string;
  route: AgentRouteInfo;
}

export type AgentEditResponse =
  | AgentEditAnswerResponse
  | AgentEditSchemaResponse
  | AgentEditPatchResponse
  | AgentEditClarificationResponse;
