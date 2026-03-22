import { Injectable } from '@nestjs/common';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentEditAnswerResponse,
  AgentEditSchemaResponse,
  AgentRouteDecision,
  ResolvedAgentMode,
} from './types/agent-edit.types';

type CacheableAgentResponse = AgentEditAnswerResponse | AgentEditSchemaResponse;

interface AgentReadCacheEntry {
  response: CacheableAgentResponse;
  createdAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class AgentReadCacheService {
  private readonly cache = new Map<string, AgentReadCacheEntry>();

  get(
    dto: AgentEditRequestDto,
    routeDecision: AgentRouteDecision,
  ): CacheableAgentResponse | undefined {
    if (!this.isCacheableMode(routeDecision.route.resolvedMode)) {
      return undefined;
    }

    const key = this.buildKey(dto, routeDecision.route.resolvedMode);
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.response;
  }

  set(
    dto: AgentEditRequestDto,
    routeDecision: AgentRouteDecision,
    response: CacheableAgentResponse,
  ) {
    if (!this.isCacheableMode(routeDecision.route.resolvedMode)) {
      return;
    }

    this.cache.set(this.buildKey(dto, routeDecision.route.resolvedMode), {
      response,
      createdAt: Date.now(),
    });
  }

  private buildKey(dto: AgentEditRequestDto, resolvedMode: 'answer' | 'schema') {
    return JSON.stringify({
      instruction: dto.instruction.trim(),
      pageId: dto.pageId?.trim(),
      version: dto.version,
      selectedId: dto.selectedId?.trim(),
      responseMode: resolvedMode,
      modelId: dto.modelId?.trim(),
      provider: dto.provider?.trim(),
    });
  }

  private isCacheableMode(mode: ResolvedAgentMode): mode is 'answer' | 'schema' {
    return mode === 'answer' || mode === 'schema';
  }
}
