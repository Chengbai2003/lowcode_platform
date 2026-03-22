import { Injectable } from '@nestjs/common';
import { AgentAnswerService } from './agent-answer.service';
import { AgentIdempotencyService } from './agent-idempotency.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentReadCacheService } from './agent-read-cache.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentSessionMemoryService } from './agent-session-memory.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentEditAnswerResponse,
  AgentEditPatchResponse,
  AgentEditResponse,
  AgentEditSchemaResponse,
} from './types/agent-edit.types';
import { AgentProgressReporter } from './types/agent-progress.types';

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
  ) {}

  async edit(
    dto: AgentEditRequestDto,
    requestId?: string,
    reporter?: AgentProgressReporter,
  ): Promise<AgentEditResponse> {
    const traceId = this.routingService.createTraceId(requestId);
    const conversationContext = this.sessionMemoryService.prepare(dto);
    const normalizedDto: AgentEditRequestDto = {
      ...dto,
      conversationHistory: conversationContext.recentHistory,
    };

    await reporter?.emitMeta(traceId);
    await reporter?.emitStatus({
      stage: 'routing',
      label: '正在判定响应模式',
    });

    const routeDecision = await this.routingService.resolve(
      {
        ...normalizedDto,
        responseMode: normalizedDto.responseMode ?? 'schema',
      },
      traceId,
    );

    await reporter?.emitRoute(routeDecision.route);

    const cachedReadResponse = this.readCacheService.get(normalizedDto, routeDecision);
    if (cachedReadResponse) {
      await reporter?.emitStatus({
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
      return reused;
    }

    if (routeDecision.route.resolvedMode === 'patch') {
      const cachedPatchResponse = this.idempotencyService.get(normalizedDto);
      if (cachedPatchResponse) {
        await reporter?.emitStatus({
          stage: 'cache_hit',
          label: '复用最近一次 patch 预览',
        });
        const reused = this.attachPatchRouteAndTrace(
          cachedPatchResponse,
          traceId,
          routeDecision.route,
        );
        this.sessionMemoryService.remember(normalizedDto, reused);
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
    return result;
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
}
