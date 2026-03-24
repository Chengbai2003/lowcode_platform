import { HttpException, Injectable } from '@nestjs/common';
import { AgentAnswerService } from './agent-answer.service';
import { AgentIdempotencyService } from './agent-idempotency.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentReadCacheService } from './agent-read-cache.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentSessionMemoryService } from './agent-session-memory.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentEditAnswerResponse,
  AgentEditPatchResponse,
  AgentEditResponse,
  AgentEditSchemaResponse,
} from './types/agent-edit.types';
import { AgentErrorEventPayload, AgentProgressReporter } from './types/agent-progress.types';
import { AgentTraceService } from './agent-trace.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly answerService: AgentAnswerService,
    private readonly legacySchemaService: AgentLegacySchemaService,
    private readonly runnerService: AgentRunnerService,
    private readonly routingService: AgentRoutingService,
    private readonly sessionMemoryService: AgentSessionMemoryService,
    private readonly readCacheService: AgentReadCacheService,
    private readonly idempotencyService: AgentIdempotencyService,
    private readonly traceService: AgentTraceService,
  ) {}

  async edit(
    dto: AgentEditRequestDto,
    requestId?: string,
    downstreamReporter?: AgentProgressReporter,
  ): Promise<AgentEditResponse> {
    const traceId = this.routingService.createTraceId(requestId);
    const conversationContext = this.sessionMemoryService.prepare(dto);
    const normalizedDto: AgentEditRequestDto = {
      ...dto,
      conversationHistory: conversationContext.recentHistory,
    };
    this.traceService.startTrace(traceId, normalizedDto);
    const reporter = this.traceService.decorateReporter(traceId, downstreamReporter);

    await reporter.emitMeta(traceId);
    await reporter.emitStatus({
      stage: 'routing',
      label: '正在判定响应模式',
    });

    try {
      const routeDecision = await this.routingService.resolve(
        {
          ...normalizedDto,
          responseMode: normalizedDto.responseMode ?? 'schema',
        },
        traceId,
      );

      await reporter.emitRoute(routeDecision.route);

      const cachedReadResponse = this.readCacheService.get(normalizedDto, routeDecision);
      if (cachedReadResponse) {
        await reporter.emitStatus({
          stage: 'cache_hit',
          label: '命中缓存结果',
        });
        const reused = this.attachRouteAndTrace(
          cachedReadResponse,
          traceId,
          routeDecision.route,
          true,
        );
        this.sessionMemoryService.remember(normalizedDto, reused);
        await reporter.emitResult(reused);
        await reporter.emitDone(true);
        return reused;
      }

      if (routeDecision.route.resolvedMode === 'patch') {
        const cachedPatchResponse = this.idempotencyService.get(normalizedDto);
        if (cachedPatchResponse) {
          await reporter.emitStatus({
            stage: 'cache_hit',
            label: '复用最近一次 patch 预览',
          });
          const reused = this.attachPatchRouteAndTrace(
            cachedPatchResponse,
            traceId,
            routeDecision.route,
          );
          this.sessionMemoryService.remember(normalizedDto, reused);
          await reporter.emitResult(reused);
          await reporter.emitDone(true);
          return reused;
        }
      }

      let result: AgentEditResponse;
      if (routeDecision.route.resolvedMode === 'answer') {
        result = await this.answerService.answer(normalizedDto, traceId, {
          routeDecision,
          reporter,
          conversationContext,
        });
      } else if (routeDecision.route.resolvedMode === 'patch') {
        result = await this.runnerService.runEdit(normalizedDto, traceId, {
          routeDecision,
          reporter,
          conversationContext,
        });
      } else {
        result = await this.legacySchemaService.edit(normalizedDto, traceId, {
          routeDecision,
          reporter,
          conversationContext,
        });
      }

      if (result.mode === 'answer' || result.mode === 'schema') {
        this.readCacheService.set(
          normalizedDto,
          routeDecision,
          result as AgentEditAnswerResponse | AgentEditSchemaResponse,
        );
      } else if (result.mode === 'patch') {
        this.idempotencyService.set(normalizedDto, result as AgentEditPatchResponse);
      }

      this.sessionMemoryService.remember(normalizedDto, result);
      await reporter.emitResult(result);
      await reporter.emitDone(true);
      return result;
    } catch (error) {
      await reporter.emitError(this.toErrorEvent(error, traceId));
      await reporter.emitDone(false);
      throw error;
    }
  }

  private attachRouteAndTrace<T extends AgentEditAnswerResponse | AgentEditSchemaResponse>(
    response: T,
    traceId: string,
    route: T['route'],
    cacheHit: boolean,
  ): T {
    return {
      ...response,
      traceId,
      route,
      cacheHit,
    };
  }

  private attachPatchRouteAndTrace(
    response: AgentEditPatchResponse,
    traceId: string,
    route: AgentEditPatchResponse['route'],
  ): AgentEditPatchResponse {
    return {
      ...response,
      traceId,
      route,
    };
  }

  private toErrorEvent(error: unknown, fallbackTraceId: string): AgentErrorEventPayload {
    if (error instanceof AgentToolException) {
      const response = error.getResponse() as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        traceId?: string;
      };
      return {
        code: response.code,
        message: response.message ?? 'Agent request failed',
        details: response.details,
        traceId: response.traceId ?? fallbackTraceId,
      };
    }

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return {
          message: response,
          traceId: fallbackTraceId,
        };
      }
      const payload = response as {
        message?: string | string[];
        code?: string;
        details?: Record<string, unknown>;
      };
      return {
        code: payload.code,
        message: Array.isArray(payload.message)
          ? payload.message.join('; ')
          : (payload.message ?? error.message),
        details: payload.details,
        traceId: fallbackTraceId,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        traceId: fallbackTraceId,
      };
    }

    return {
      message: 'Unknown agent error',
      traceId: fallbackTraceId,
    };
  }
}
