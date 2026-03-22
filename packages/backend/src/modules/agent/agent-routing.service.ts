import { Injectable, Logger } from '@nestjs/common';
import { ContextAssemblerService } from '../schema-context';
import { FocusContextResult } from '../schema-context/types/focus-context.types';
import { AgentIntentClassifierService } from './agent-intent-classifier.service';
import { AgentPolicyService } from './agent-policy.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  AgentResponseMode,
  AgentRouteDecision,
  AgentRouteReason,
  AgentRouteInfo,
  AgentIntentClassification,
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
const EDIT_INTENT_KEYWORDS = [
  '改',
  '修改',
  '删除',
  '移到',
  '移动',
  '新增',
  '添加',
  '插入',
  '绑定',
  '替换',
  '设置',
  '调整',
  '改成',
  '改为',
  '换成',
  '变成',
  '更新',
  '加上',
  '去掉',
  '移除',
  '隐藏',
  '显示',
];
const PAGE_QUESTION_KEYWORDS = [
  '这个页面',
  '当前页面',
  '这个按钮',
  '这个组件',
  '这个表单',
  '为什么',
  '原因',
  '作用',
  '做什么',
  '干什么',
  '解释',
  '介绍',
  '说明',
  '分析',
  '看一下',
  '看看',
  '禁用',
];
const GENERAL_QUESTION_KEYWORDS = [
  '你是谁',
  '你能做什么',
  '怎么用',
  '如何使用',
  'help',
  'what can you do',
  'who are you',
];
const QUESTION_SUFFIXES = ['吗', '么', '?', '？'];
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const LOW_CONFIDENCE_THRESHOLD = 0.55;

@Injectable()
export class AgentRoutingService {
  private readonly logger = new Logger(AgentRoutingService.name);

  constructor(
    private readonly contextAssembler: ContextAssemblerService,
    private readonly intentClassifier: AgentIntentClassifierService,
    private readonly policyService: AgentPolicyService,
  ) {}

  createTraceId(requestId?: string): string {
    return this.policyService.createTraceId(requestId);
  }

  async resolve(dto: AgentEditRequestDto, traceId: string): Promise<AgentRouteDecision> {
    const requestedMode = dto.responseMode ?? 'schema';

    if (requestedMode === 'answer') {
      return this.createDecision(dto, traceId, requestedMode, 'answer', 'manual_answer');
    }

    if (requestedMode === 'schema') {
      return this.createDecision(dto, traceId, requestedMode, 'schema', 'manual_schema');
    }

    if (requestedMode === 'patch') {
      return this.createDecision(dto, traceId, requestedMode, 'patch', 'manual_patch');
    }

    const classification = await this.intentClassifier.classify(dto, traceId);
    if (classification) {
      const llmDecision = await this.resolveByIntentClassifier(
        dto,
        traceId,
        requestedMode,
        classification,
      );
      if (llmDecision && classification.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        return this.applyRouteMetadata(llmDecision, {
          confidence: classification.confidence,
          classifierSource: 'llm',
          fallbackApplied: false,
        });
      }

      const ruleDecision = await this.resolveByRules(dto, traceId, requestedMode);
      if (
        llmDecision &&
        classification.confidence >= LOW_CONFIDENCE_THRESHOLD &&
        llmDecision.route.resolvedMode === ruleDecision.route.resolvedMode
      ) {
        return this.applyRouteMetadata(llmDecision, {
          confidence: classification.confidence,
          classifierSource: 'llm',
          fallbackApplied: false,
        });
      }

      return this.applyRouteMetadata(ruleDecision, {
        confidence: classification.confidence,
        classifierSource: 'llm_with_rule_fallback',
        fallbackApplied: true,
      });
    }

    return this.applyRouteMetadata(await this.resolveByRules(dto, traceId, requestedMode), {
      classifierSource: 'rules',
      fallbackApplied: false,
    });
  }

  private async resolveByIntentClassifier(
    dto: AgentEditRequestDto,
    traceId: string,
    requestedMode: AgentResponseMode,
    classification: AgentIntentClassification,
  ): Promise<AgentRouteDecision | undefined> {
    if (classification.mode === 'patch') {
      if (!dto.pageId?.trim() || dto.version === undefined) {
        this.logger.warn(
          `[${traceId}] llm intent chose patch but page context is missing, fallback to rules`,
        );
        return undefined;
      }

      const prefetchedFocusContext = await this.prefetchFocusContext(dto);
      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'patch',
        'llm_intent_patch',
        prefetchedFocusContext,
      );
    }

    const prefetchedFocusContext =
      classification.needsPageContext && dto.pageId?.trim() && dto.version !== undefined
        ? await this.prefetchFocusContext(dto)
        : undefined;

    return this.createDecision(
      dto,
      traceId,
      requestedMode,
      classification.mode,
      classification.mode === 'answer' ? 'llm_intent_answer' : 'llm_intent_schema',
      prefetchedFocusContext,
    );
  }

  private applyRouteMetadata(
    decision: AgentRouteDecision,
    metadata: Pick<AgentRouteInfo, 'confidence' | 'classifierSource' | 'fallbackApplied'>,
  ): AgentRouteDecision {
    return {
      ...decision,
      route: {
        ...decision.route,
        ...metadata,
      },
    };
  }

  private async resolveByRules(
    dto: AgentEditRequestDto,
    traceId: string,
    requestedMode: AgentResponseMode,
  ): Promise<AgentRouteDecision> {
    if (this.isGeneralQuestionIntent(dto.instruction)) {
      return this.createDecision(dto, traceId, requestedMode, 'answer', 'general_question_intent');
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

    if (this.isPageQuestionIntent(dto.instruction)) {
      const prefetchedFocusContext =
        dto.pageId?.trim() && dto.version !== undefined
          ? await this.contextAssembler.assemble({
              pageId: dto.pageId,
              version: dto.version,
              draftSchema: dto.draftSchema,
              selectedId: dto.selectedId,
              instruction: dto.instruction,
            })
          : undefined;

      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'answer',
        'page_question_intent',
        prefetchedFocusContext,
      );
    }

    if (!dto.pageId?.trim() || dto.version === undefined) {
      return this.createDecision(dto, traceId, requestedMode, 'schema', 'missing_page_context');
    }

    const prefetchedFocusContext = await this.contextAssembler.assemble({
      pageId: dto.pageId,
      version: dto.version,
      draftSchema: dto.draftSchema,
      selectedId: dto.selectedId,
      instruction: dto.instruction,
    });
    const isEditIntent = this.isEditIntent(dto.instruction);

    if (dto.selectedId?.trim() && isEditIntent) {
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
      isEditIntent &&
      (prefetchedFocusContext.mode === 'focused' ||
        (prefetchedFocusContext.candidates?.length ?? 0) > 0)
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

    if (!isEditIntent) {
      return this.createDecision(
        dto,
        traceId,
        requestedMode,
        'answer',
        'page_question_intent',
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

  private prefetchFocusContext(dto: AgentEditRequestDto): Promise<FocusContextResult> {
    return this.contextAssembler.assemble({
      pageId: dto.pageId,
      version: dto.version,
      draftSchema: dto.draftSchema,
      selectedId: dto.selectedId,
      instruction: dto.instruction,
    });
  }

  private createDecision(
    dto: AgentEditRequestDto,
    traceId: string,
    requestedMode: AgentResponseMode,
    resolvedMode: ResolvedAgentMode,
    reason: AgentRouteReason,
    prefetchedFocusContext?: FocusContextResult,
    metadata?: Partial<Pick<AgentRouteInfo, 'confidence' | 'classifierSource' | 'fallbackApplied'>>,
  ): AgentRouteDecision {
    const route: AgentRouteDecision['route'] = {
      requestedMode,
      resolvedMode,
      reason,
      manualOverride: requestedMode !== 'auto',
      ...metadata,
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

  private isEditIntent(instruction: string): boolean {
    const normalized = instruction.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return EDIT_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private isGeneralQuestionIntent(instruction: string): boolean {
    const normalized = instruction.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      GENERAL_QUESTION_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
      (this.hasQuestionShape(normalized) &&
        !this.isEditIntent(normalized) &&
        !this.hasPageReference(normalized))
    );
  }

  private isPageQuestionIntent(instruction: string): boolean {
    const normalized = instruction.trim().toLowerCase();
    if (!normalized || this.isEditIntent(normalized)) {
      return false;
    }

    return (
      PAGE_QUESTION_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
      (this.hasQuestionShape(normalized) && this.hasPageReference(normalized))
    );
  }

  private hasPageReference(instruction: string): boolean {
    return (
      instruction.includes('页面') ||
      instruction.includes('组件') ||
      instruction.includes('按钮') ||
      instruction.includes('表单') ||
      instruction.includes('输入框') ||
      instruction.includes('当前') ||
      instruction.includes('这个')
    );
  }

  private hasQuestionShape(instruction: string): boolean {
    return QUESTION_SUFFIXES.some((suffix) => instruction.includes(suffix));
  }
}
