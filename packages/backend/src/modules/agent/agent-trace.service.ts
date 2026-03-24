import { Injectable, Logger } from '@nestjs/common';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentEditResponse,
  AgentResponseMode,
  AgentRouteInfo,
} from './types/agent-edit.types';
import {
  AgentErrorEventPayload,
  AgentProgressReporter,
  AgentStatusEvent,
} from './types/agent-progress.types';

const TRACE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_CHARS = 320;

export interface AgentTraceRequestSummary {
  instruction: string;
  pageId?: string;
  version?: number;
  selectedId?: string;
  sessionId?: string;
  responseMode?: AgentResponseMode;
  confirmedScopeId?: string;
  confirmedIntentId?: string;
  stream?: boolean;
  hasDraftSchema: boolean;
}

export interface AgentTraceStatusRecord extends AgentStatusEvent {
  timestamp: number;
}

export interface AgentTraceToolCallRecord {
  toolName: string;
  inputSummary: string;
  outputSummary?: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface AgentTraceResultSummary {
  mode: AgentEditResponse['mode'];
  warningsCount: number;
  resolvedSelectedId?: string;
  requiresConfirmation?: boolean;
}

export interface AgentTraceRecord {
  traceId: string;
  request: AgentTraceRequestSummary;
  route?: AgentRouteInfo;
  startedAt: number;
  finishedAt?: number;
  success?: boolean;
  statusEvents: AgentTraceStatusRecord[];
  toolCalls: AgentTraceToolCallRecord[];
  result?: AgentTraceResultSummary;
  error?: AgentErrorEventPayload;
  versionConflictCount: number;
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.length <= MAX_SUMMARY_CHARS
      ? value
      : `${value.slice(0, MAX_SUMMARY_CHARS - 3)}...`;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return String(value);
    }
    return serialized.length <= MAX_SUMMARY_CHARS
      ? serialized
      : `${serialized.slice(0, MAX_SUMMARY_CHARS - 3)}...`;
  } catch {
    return String(value);
  }
}

function buildRequestSummary(dto: AgentEditRequestDto): AgentTraceRequestSummary {
  return {
    instruction: dto.instruction.trim(),
    pageId: dto.pageId,
    version: dto.version,
    selectedId: dto.selectedId,
    sessionId: dto.sessionId,
    responseMode: dto.responseMode,
    confirmedScopeId: dto.confirmedScopeId,
    confirmedIntentId: dto.confirmedIntentId,
    stream: dto.stream,
    hasDraftSchema: Boolean(dto.draftSchema),
  };
}

function buildResultSummary(result: AgentEditResponse): AgentTraceResultSummary {
  return {
    mode: result.mode,
    warningsCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    resolvedSelectedId: 'resolvedSelectedId' in result ? result.resolvedSelectedId : undefined,
    requiresConfirmation: 'requiresConfirmation' in result ? result.requiresConfirmation : undefined,
  };
}

@Injectable()
export class AgentTraceService {
  private readonly logger = new Logger(AgentTraceService.name);
  private readonly traces = new Map<string, AgentTraceRecord>();

  startTrace(traceId: string, dto: AgentEditRequestDto) {
    this.pruneExpired();
    const request = buildRequestSummary(dto);
    this.traces.set(traceId, {
      traceId,
      request,
      startedAt: Date.now(),
      statusEvents: [],
      toolCalls: [],
      versionConflictCount: 0,
    });
    this.logStructuredEvent('meta', traceId, {
      request,
    });
  }

  decorateReporter(traceId: string, downstream?: AgentProgressReporter): AgentProgressReporter {
    return {
      emitMeta: async (metaTraceId) => {
        this.ensureTrace(traceId);
        await downstream?.emitMeta(metaTraceId);
      },
      emitRoute: async (route) => {
        this.recordRoute(traceId, route);
        await downstream?.emitRoute(route);
      },
      emitStatus: async (event) => {
        this.recordStatus(traceId, event);
        await downstream?.emitStatus(event);
      },
      emitContentDelta: async (event) => {
        await downstream?.emitContentDelta(event);
      },
      emitResult: async (result) => {
        this.recordResult(traceId, result);
        await downstream?.emitResult(result);
      },
      emitError: async (error) => {
        this.recordError(traceId, error);
        await downstream?.emitError(error);
      },
      emitDone: async (success) => {
        this.recordDone(traceId, success);
        await downstream?.emitDone(success);
      },
    };
  }

  recordRoute(traceId: string, route: AgentRouteInfo) {
    this.ensureTrace(traceId).route = route;
    this.logStructuredEvent('route', traceId, {
      requestedMode: route.requestedMode,
      resolvedMode: route.resolvedMode,
      reason: route.reason,
      manualOverride: route.manualOverride,
    });
  }

  recordStatus(traceId: string, event: AgentStatusEvent) {
    const record = {
      ...event,
      timestamp: Date.now(),
    };
    this.ensureTrace(traceId).statusEvents.push(record);
    this.logStructuredEvent('status', traceId, {
      stage: record.stage,
      label: record.label,
      detail: record.detail,
      toolName: record.toolName,
      targetId: record.targetId,
      stepNumber: record.stepNumber,
      finishReason: record.finishReason,
      timestamp: record.timestamp,
    });
  }

  recordToolCall(
    traceId: string,
    input: {
      toolName: string;
      toolInput: unknown;
      toolOutput?: unknown;
      success: boolean;
      durationMs: number;
      errorCode?: string;
      errorMessage?: string;
    },
  ) {
    const record = {
      toolName: input.toolName,
      inputSummary: summarizeValue(input.toolInput),
      outputSummary: input.toolOutput === undefined ? undefined : summarizeValue(input.toolOutput),
      success: input.success,
      durationMs: input.durationMs,
      timestamp: Date.now(),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    };
    this.ensureTrace(traceId).toolCalls.push(record);
    this.logStructuredEvent('tool', traceId, {
      toolName: record.toolName,
      success: record.success,
      durationMs: record.durationMs,
      errorCode: record.errorCode,
      inputSummary: record.inputSummary,
      outputSummary: record.outputSummary,
      timestamp: record.timestamp,
    });
  }

  recordResult(traceId: string, result: AgentEditResponse) {
    const summary = buildResultSummary(result);
    this.ensureTrace(traceId).result = summary;
    this.logStructuredEvent('result', traceId, {
      mode: summary.mode,
      warningsCount: summary.warningsCount,
      resolvedSelectedId: summary.resolvedSelectedId,
      requiresConfirmation: summary.requiresConfirmation,
    });
  }

  recordError(traceId: string, error: AgentErrorEventPayload) {
    this.ensureTrace(traceId).error = error;
    this.logStructuredEvent('error', traceId, {
      code: error.code,
      message: error.message,
    });
  }

  recordDone(traceId: string, success: boolean) {
    const trace = this.ensureTrace(traceId);
    trace.success = success;
    trace.finishedAt = Date.now();
    this.logStructuredEvent('done', traceId, {
      success,
      finishedAt: trace.finishedAt,
    });
  }

  markVersionConflict(traceId: string) {
    const trace = this.ensureTrace(traceId);
    trace.versionConflictCount += 1;
    this.logStructuredEvent('version_conflict', traceId, {
      versionConflictCount: trace.versionConflictCount,
    });
  }

  getTrace(traceId: string): AgentTraceRecord | undefined {
    this.pruneExpired();
    return this.traces.get(traceId);
  }

  listTraces(input?: { from?: number; to?: number }): AgentTraceRecord[] {
    this.pruneExpired();
    const from = input?.from ?? Number.NEGATIVE_INFINITY;
    const to = input?.to ?? Number.POSITIVE_INFINITY;
    return Array.from(this.traces.values())
      .filter((trace) => trace.startedAt >= from && trace.startedAt <= to)
      .sort((left, right) => left.startedAt - right.startedAt);
  }

  private ensureTrace(traceId: string): AgentTraceRecord {
    const trace = this.traces.get(traceId);
    if (trace) {
      return trace;
    }

    const created: AgentTraceRecord = {
      traceId,
      request: {
        instruction: '',
        hasDraftSchema: false,
      },
      startedAt: Date.now(),
      statusEvents: [],
      toolCalls: [],
      versionConflictCount: 0,
    };
    this.traces.set(traceId, created);
    return created;
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [traceId, trace] of this.traces.entries()) {
      const expiresAt = (trace.finishedAt ?? trace.startedAt) + TRACE_TTL_MS;
      if (expiresAt <= now) {
        this.traces.delete(traceId);
      }
    }
  }

  private logStructuredEvent(
    eventType: string,
    traceId: string,
    payload: Record<string, unknown>,
  ) {
    try {
      this.logger.verbose(
        JSON.stringify({
          kind: 'agent_trace',
          eventType,
          traceId,
          timestamp: Date.now(),
          ...payload,
        }),
      );
    } catch {
      this.logger.verbose(`[agent_trace] ${eventType} ${traceId}`);
    }
  }
}
