import { Injectable } from '@nestjs/common';
import { AgentTraceService } from './agent-trace.service';

@Injectable()
export class AgentReplayService {
  constructor(private readonly traceService: AgentTraceService) {}

  getReplay(traceId: string) {
    const trace = this.traceService.getTrace(traceId);
    if (!trace) {
      return undefined;
    }

    const replaySteps = [
      ...(trace.route
        ? [
            {
              timestamp: trace.startedAt,
              type: 'route',
              label: '已确定响应模式',
              detail: `${trace.route.requestedMode} -> ${trace.route.resolvedMode}`,
            },
          ]
        : []),
      ...trace.statusEvents.map((event) => ({
        timestamp: event.timestamp,
        type: 'status',
        label: event.label,
        detail: event.detail,
        toolName: event.toolName,
        success: true,
      })),
      ...trace.toolCalls.map((toolCall) => ({
        timestamp: toolCall.timestamp,
        type: 'tool',
        label: toolCall.toolName,
        detail: toolCall.outputSummary ?? toolCall.inputSummary,
        toolName: toolCall.toolName,
        success: toolCall.success,
        errorCode: toolCall.errorCode,
      })),
      ...(trace.result
        ? [
            {
              timestamp: trace.finishedAt ?? trace.startedAt,
              type: 'result',
              label: `结果模式：${trace.result.mode}`,
              detail: trace.result.mode,
              success: true,
            },
          ]
        : []),
      ...(trace.error
        ? [
            {
              timestamp: trace.finishedAt ?? trace.startedAt,
              type: 'error',
              label: trace.error.message,
              detail: trace.error.message,
              success: false,
              errorCode: trace.error.code,
            },
          ]
        : []),
    ].sort((left, right) => left.timestamp - right.timestamp);

    return {
      traceId: trace.traceId,
      request: trace.request,
      replaySteps,
    };
  }
}
