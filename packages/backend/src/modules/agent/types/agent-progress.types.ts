import { AgentEditResponse, AgentRouteInfo } from './agent-edit.types';

export type AgentProgressStage =
  | 'routing'
  | 'assembling_context'
  | 'resolving_target'
  | 'calling_model'
  | 'calling_tool'
  | 'validating_output'
  | 'completed';

export interface AgentStatusEvent {
  stage: AgentProgressStage;
  label: string;
  detail?: string;
  toolName?: string;
  targetId?: string;
  stepNumber?: number;
  finishReason?: string;
}

export interface AgentErrorEventPayload {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
  traceId: string;
}

export interface AgentContentDeltaEvent {
  mode: 'answer' | 'schema';
  delta: string;
}

export type AgentStreamEvent =
  | { type: 'meta'; traceId: string }
  | { type: 'route'; route: AgentRouteInfo }
  | {
      type: 'status';
      stage: AgentProgressStage;
      label: string;
      detail?: string;
      toolName?: string;
      targetId?: string;
      stepNumber?: number;
      finishReason?: string;
    }
  | { type: 'content_delta'; mode: 'answer' | 'schema'; delta: string }
  | { type: 'result'; result: AgentEditResponse }
  | { type: 'error'; error: AgentErrorEventPayload }
  | { type: 'done'; success: boolean };

export interface AgentProgressReporter {
  emitMeta(traceId: string): void | Promise<void>;
  emitRoute(route: AgentRouteInfo): void | Promise<void>;
  emitStatus(event: AgentStatusEvent): void | Promise<void>;
  emitContentDelta(event: AgentContentDeltaEvent): void | Promise<void>;
  emitResult(result: AgentEditResponse): void | Promise<void>;
  emitError(error: AgentErrorEventPayload): void | Promise<void>;
  emitDone(success: boolean): void | Promise<void>;
}

export const NOOP_AGENT_PROGRESS_REPORTER: AgentProgressReporter = {
  emitMeta() {},
  emitRoute() {},
  emitStatus() {},
  emitContentDelta() {},
  emitResult() {},
  emitError() {},
  emitDone() {},
};
