import { Injectable } from '@nestjs/common';
import { AgentTraceRecord, AgentTraceService } from './agent-trace.service';

export interface AgentMetricsSummary {
  totalCount: number;
  successCount: number;
  failureCount: number;
  confirmationBlockedCount: number;
  averageDurationMs: number;
  averageToolCallCount: number;
  versionConflictCount: number;
}

function isConfirmationResult(trace: AgentTraceRecord) {
  return (
    trace.result?.mode === 'clarification' ||
    trace.result?.mode === 'scope_confirmation' ||
    trace.result?.mode === 'intent_confirmation'
  );
}

@Injectable()
export class AgentMetricsService {
  constructor(private readonly traceService: AgentTraceService) {}

  getSummary(input?: { from?: number; to?: number }): AgentMetricsSummary {
    const traces = this.traceService.listTraces(input).filter((trace) => trace.finishedAt);
    if (traces.length === 0) {
      return {
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        confirmationBlockedCount: 0,
        averageDurationMs: 0,
        averageToolCallCount: 0,
        versionConflictCount: 0,
      };
    }

    const totalDuration = traces.reduce(
      (sum, trace) => sum + ((trace.finishedAt ?? trace.startedAt) - trace.startedAt),
      0,
    );
    const totalToolCalls = traces.reduce((sum, trace) => sum + trace.toolCalls.length, 0);

    return {
      totalCount: traces.length,
      successCount: traces.filter((trace) => trace.success && !isConfirmationResult(trace)).length,
      failureCount: traces.filter((trace) => !trace.success && !isConfirmationResult(trace)).length,
      confirmationBlockedCount: traces.filter((trace) => isConfirmationResult(trace)).length,
      averageDurationMs: Math.round(totalDuration / traces.length),
      averageToolCallCount: Number((totalToolCalls / traces.length).toFixed(2)),
      versionConflictCount: traces.reduce((sum, trace) => sum + trace.versionConflictCount, 0),
    };
  }
}
