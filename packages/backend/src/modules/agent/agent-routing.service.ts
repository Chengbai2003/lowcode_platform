import { Injectable, Logger } from '@nestjs/common';
import { ContextAssemblerService } from '../schema-context';
import { FocusContextResult } from '../schema-context/types/focus-context.types';
import { AgentPolicyService } from './agent-policy.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentResponseMode,
  AgentRouteDecision,
  AgentRouteReason,
  ResolvedAgentMode,
} from './types/agent-edit.types';

const WHOLE_PAGE_GENERATION_VERBS = [
  '生成',
  '创建',
  '新建',
  '搭建',
  '设计',
  '重做',
  '重构',
  '做一个',
  '做个',
];
const WHOLE_PAGE_GENERATION_NOUNS = [
  '页面',
  '页',
  '首页',
  '登录页',
  '详情页',
  '列表页',
  'dashboard',
  '表单页',
];

@Injectable()
export class AgentRoutingService {
  private readonly logger = new Logger(AgentRoutingService.name);

  constructor(
    private readonly contextAssembler: ContextAssemblerService,
    private readonly policyService: AgentPolicyService,
  ) {}

  createTraceId(requestId?: string): string {
    return this.policyService.createTraceId(requestId);
  }

  async resolve(dto: AgentEditRequestDto, traceId: string): Promise<AgentRouteDecision> {
    const requestedMode = dto.responseMode ?? 'schema';

    if (requestedMode === 'schema') {
      return this.createDecision(dto, traceId, requestedMode, 'schema', 'manual_schema');
    }

    if (requestedMode === 'patch') {
      return this.createDecision(dto, traceId, requestedMode, 'patch', 'manual_patch');
    }

    if (!dto.pageId?.trim() || dto.version === undefined) {
      return this.createDecision(dto, traceId, requestedMode, 'schema', 'missing_page_context');
    }

    if (this.isWholePageGenerationIntent(dto.instruction)) {
      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'schema',
        'whole_page_generation_intent',
      );
    }

    const prefetchedFocusContext = await this.contextAssembler.assemble({
      pageId: dto.pageId,
      version: dto.version,
      draftSchema: dto.draftSchema,
      selectedId: dto.selectedId,
      instruction: dto.instruction,
    });

    if (dto.selectedId?.trim()) {
      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'patch',
        'selected_target',
        prefetchedFocusContext,
      );
    }

    if (
      prefetchedFocusContext.mode === 'focused' ||
      (prefetchedFocusContext.candidates?.length ?? 0) > 0
    ) {
      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'patch',
        'candidate_target',
        prefetchedFocusContext,
      );
    }

    return this.createDecision(
      dto,
      traceId,
      requestedMode,
      'patch',
      'default_edit_with_page_context',
      prefetchedFocusContext,
    );
  }

  private createDecision(
    dto: AgentEditRequestDto,
    traceId: string,
    requestedMode: AgentResponseMode,
    resolvedMode: ResolvedAgentMode,
    reason: AgentRouteReason,
    prefetchedFocusContext?: FocusContextResult,
  ): AgentRouteDecision {
    const route: AgentRouteDecision['route'] = {
      requestedMode,
      resolvedMode,
      reason,
      manualOverride: requestedMode !== 'auto',
    };

    this.logger.log(
      `[${traceId}] route requested=${requestedMode} resolved=${resolvedMode} reason=${reason}`,
    );

    return {
      traceId,
      route,
      prefetchedFocusContext,
      requestedPageId: dto.pageId,
    };
  }

  private isWholePageGenerationIntent(instruction: string): boolean {
    const normalized = instruction.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      WHOLE_PAGE_GENERATION_VERBS.some((keyword) => normalized.includes(keyword)) &&
      WHOLE_PAGE_GENERATION_NOUNS.some((keyword) => normalized.includes(keyword))
    );
  }
}
