import type { A2UISchema } from '../../../../types';
import type { EditorPatchOperation } from '../../../types/patch';
import type {
  AgentCollectionScope,
  AgentClarificationCandidate,
  AgentIntentConfirmationOption,
  AgentMessageProgress,
  AgentPatchChangeGroup,
  AgentPatchRiskAssessment,
  AgentPatchScopeSummary,
  AgentRouteInfo,
  AgentTraceSummary,
} from '../types/ai-types';

export interface AIPatchPreviewState {
  instruction: string;
  patch: EditorPatchOperation[];
  resolvedSelectedId?: string;
  previewSchema: A2UISchema;
  previewSummary: string;
  changeGroups: AgentPatchChangeGroup[];
  warnings: string[];
  risk: AgentPatchRiskAssessment;
  requiresConfirmation: boolean;
  scopeSummary?: AgentPatchScopeSummary;
  // ponytail: P0-4 跨页隔离双重校验 + P0-5 TOCTOU atomic (capture generation at preview creation)
  sourcePageId: string | null;
  basePageVersion: number | null;
  sourceGeneration: number;
  documentSessionId: string;
}

export interface AIClarificationState {
  clarificationId: string;
  instruction: string;
  question: string;
  candidates: AgentClarificationCandidate[];
}

export interface AIScopeConfirmationState {
  scopeConfirmationId: string;
  instruction: string;
  question: string;
  scope: AgentCollectionScope;
  warnings: string[];
}

export interface AIIntentConfirmationState {
  intentConfirmationId: string;
  instruction: string;
  question: string;
  options: AgentIntentConfirmationOption[];
  warnings: string[];
}

export interface AIMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  schema?: A2UISchema;
  suggestions?: string[];
  status?: 'loading' | 'success' | 'error';
  modelUsed?: string;
  route?: AgentRouteInfo;
  progress?: AgentMessageProgress;
  traceId?: string;
  traceSummary?: AgentTraceSummary;
  patchPreview?: AIPatchPreviewState;
  clarification?: AIClarificationState;
  intentConfirmation?: AIIntentConfirmationState;
  scopeConfirmation?: AIScopeConfirmationState;
  applyState?: 'pending' | 'applying' | 'applied' | 'failed';
}
