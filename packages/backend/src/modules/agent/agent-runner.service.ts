import { Injectable, Logger } from '@nestjs/common';
import { getCoreActionTypes } from '../ai/prompt-builder';
import { AIService, AIToolCallingError } from '../ai/ai.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../agent-tools/tool-registry.service';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { ToolDefinition } from '../agent-tools/types/tool.types';
import { ToolExecutionContext } from '../agent-tools/types/tool.types';
import {
  CollectionTargetResolution,
  CollectionTargetResolverService,
  ComponentMetaRegistry,
} from '../schema-context';
import type {
  A2UIComponent,
  A2UISchema,
  FocusContextResult,
  NodeCandidate,
} from '../schema-context';
import { buildAncestorChain, buildParentMap } from '../schema-context/utils/parent-map.builder';
import { buildPatchPresentation } from './agent-preview.utils';
import { AgentIntentConfirmationService } from './agent-intent-confirmation.service';
import {
  AgentIntentNormalizationService,
  NormalizedIntentOption,
} from './agent-intent-normalization.service';
import { AgentScopeConfirmationService } from './agent-scope-confirmation.service';
import { AgentTraceService } from './agent-trace.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentConversationContext } from './agent-session-memory.service';
import {
  buildCompactContextSections,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import { AgentPatchRunProfile, AgentPolicyService, AgentRunMetrics } from './agent-policy.service';
import { AgentProgressReporter, NOOP_AGENT_PROGRESS_REPORTER } from './types/agent-progress.types';
import {
  AgentCollectionScope,
  AgentClarificationCandidate,
  AgentEditClarificationResponse,
  AgentEditIntentConfirmationResponse,
  AgentEditPatchResponse,
  AgentEditScopeConfirmationResponse,
  AgentIntentConfirmationOption,
  AgentPatchScopeSummary,
  AgentRouteDecision,
} from './types/agent-edit.types';

const CLARIFICATION_CANDIDATE_LIMIT = 3;
const DEFAULT_LABEL_PROPS = [
  'children',
  'title',
  'label',
  'placeholder',
  'message',
  'description',
  'header',
  'tab',
  'name',
  'text',
] as const;
const MAX_LABEL_CHARS = 32;
const MAX_PATH_SEGMENT_CHARS = 18;
const READ_RETRYABLE_TOOLS = new Set([
  'get_page_schema',
  'get_focus_context',
  'find_node_candidates',
  'get_component_meta',
  'resolve_collection_scope',
  'preview_patch',
  'validate_patch',
  'auto_fix_patch',
]);
const COLLECTION_INTENT_REGEX = /所有|全部|每个|当前.+(?:下|内|中)/;
const BATCH_SCOPE_TOOL_NAMES = new Set(['resolve_collection_scope', 'get_component_meta']);
const BATCH_PATCH_TOOL_NAMES = new Set(['update_components_props', 'get_component_meta']);

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly toolExecutionService: ToolExecutionService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly policyService: AgentPolicyService,
    private readonly componentMetaRegistry: ComponentMetaRegistry,
    private readonly collectionTargetResolver: CollectionTargetResolverService,
    private readonly intentNormalizationService: AgentIntentNormalizationService,
    private readonly intentConfirmationService: AgentIntentConfirmationService,
    private readonly scopeConfirmationService: AgentScopeConfirmationService,
    private readonly traceService: AgentTraceService,
  ) {}

  async runEdit(
    dto: AgentEditRequestDto,
    requestId?: string,
    options?: {
      routeDecision?: AgentRouteDecision;
      reporter?: AgentProgressReporter;
      conversationContext?: AgentConversationContext;
    },
  ): Promise<
    | AgentEditPatchResponse
    | AgentEditClarificationResponse
    | AgentEditScopeConfirmationResponse
    | AgentEditIntentConfirmationResponse
  > {
    const traceId = this.policyService.createTraceId(requestId);
    const metrics: AgentRunMetrics = { stepCount: 0, toolCallCount: 0 };
    const reporter = options?.reporter ?? NOOP_AGENT_PROGRESS_REPORTER;
    let retryCount = 0;
    const hasConfirmedIntent = Boolean(dto.confirmedIntentId?.trim());
    const isCollectionIntent = hasConfirmedIntent || this.hasCollectionIntent(dto.instruction);

    this.policyService.assertPatchRequestAllowed(dto, traceId);

    await reporter.emitStatus({
      stage: 'assembling_context',
      label: '正在准备页面上下文',
    });

    const recoveredContext = await this.createExecutionContextWithRecovery(dto, traceId, reporter);
    const context = recoveredContext.context;
    retryCount += recoveredContext.retryCount;

    this.logger.log(
      `[${traceId}] run start mode=patch pageId=${dto.pageId} version=${dto.version ?? 'n/a'}`,
    );

    if (dto.confirmedScopeId?.trim()) {
      if (!dto.sessionId?.trim()) {
        this.policyService.throwPolicyBlocked(traceId, '批量范围确认已失效，请重新发起批量修改');
      }
    } else if (hasConfirmedIntent) {
      if (!dto.sessionId?.trim()) {
        this.policyService.throwPolicyBlocked(traceId, '语义确认已失效，请重新发起批量修改');
      }
    } else if (isCollectionIntent) {
      const collectionClarification = this.buildCollectionContainerClarification(
        dto,
        context,
        traceId,
        options?.routeDecision,
      );
      if (collectionClarification) {
        await reporter.emitStatus({
          stage: 'completed',
          label: '需要先选中父级容器',
        });
        return collectionClarification;
      }
    }

    await reporter.emitStatus({
      stage: 'resolving_target',
      label: '正在解析编辑目标',
    });

    const targetResolution = await this.resolveTarget(
      dto,
      context,
      traceId,
      recoveredContext.retryCount > 0 ? undefined : options?.routeDecision?.prefetchedFocusContext,
      options?.routeDecision,
    );
    if ('clarificationResponse' in targetResolution) {
      await reporter.emitStatus({
        stage: 'completed',
        label: '需要用户澄清目标组件',
      });
      return targetResolution.clarificationResponse;
    }

    const { resolvedSelectedId, focusContextResult } = targetResolution;
    if (dto.confirmedScopeId?.trim()) {
      return this.runConfirmedBatchPatch(
        dto,
        context,
        traceId,
        resolvedSelectedId,
        focusContextResult,
        reporter,
        options?.conversationContext,
        options?.routeDecision,
      );
    }

    if (isCollectionIntent) {
      if (hasConfirmedIntent) {
        return this.runConfirmedIntentScopePlanning(
          dto,
          context,
          traceId,
          resolvedSelectedId,
          reporter,
          options?.routeDecision,
        );
      }

      const normalization = resolvedSelectedId
        ? this.intentNormalizationService.normalize({
            instruction: dto.instruction,
            rootId: resolvedSelectedId,
            schema: context.workingSchema,
          })
        : { status: 'no_match' as const };

      if (normalization.status === 'normalized') {
        return this.planBatchScopeForIntent(
          dto,
          context,
          traceId,
          resolvedSelectedId,
          reporter,
          options?.routeDecision,
          normalization.option,
          '已识别集合语义，正在确认批量范围',
        );
      }

      if (normalization.status === 'confirmation_required') {
        return this.createIntentConfirmationResponse(
          dto,
          context,
          traceId,
          resolvedSelectedId,
          reporter,
          options?.routeDecision,
          normalization.options,
        );
      }

      return this.runBatchScopePlanning(
        dto,
        context,
        traceId,
        resolvedSelectedId,
        focusContextResult,
        reporter,
        options?.conversationContext,
        options?.routeDecision,
      );
    }

    const selectedProfile = this.policyService.selectPatchRunProfile({
      instruction: dto.instruction,
      selectedId: resolvedSelectedId,
      focusContextResult,
    });
    const prompt = this.buildPrompt(
      dto,
      focusContextResult,
      resolvedSelectedId,
      options?.conversationContext,
    );

    try {
      let finishReason = 'fast_path';
      const fastPathApplied = await this.tryFastPath(
        dto,
        context,
        focusContextResult,
        resolvedSelectedId,
        selectedProfile,
        traceId,
        reporter,
      );

      if (fastPathApplied) {
        metrics.stepCount = 1;
        metrics.toolCallCount = Math.max(metrics.toolCallCount, 1);
      } else {
        const effectiveProfile = selectedProfile === 'fast_path' ? 'simple_patch' : selectedProfile;
        const limits = this.policyService.getLimits(effectiveProfile);
        const agentTools = this.toolRegistry.listDefinitions('agent');

        await reporter.emitStatus({
          stage: 'calling_model',
          label: '正在调用模型规划编辑步骤',
          targetId: resolvedSelectedId,
          detail: `预算: ${effectiveProfile} / maxSteps=${limits.maxSteps} / maxToolCalls=${limits.maxToolCalls}`,
        });

        const result = await this.aiService.runToolCalling({
          system: this.buildSystemPrompt(focusContextResult.componentList),
          prompt,
          provider: dto.provider,
          modelId: dto.modelId,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
          timeoutMs: limits.timeoutMs,
          maxSteps: limits.maxSteps,
          maxToolCalls: limits.maxToolCalls,
          toolDefinitions: agentTools,
          executeTool: async (name, input) => {
            const isWriteOperation = this.isWriteTool(name);
            this.logger.log(
              `[${traceId}] tool execute name=${name} write=${isWriteOperation} input=${this.summarizeToolInput(input)}`,
            );
            try {
              const toolResult = await this.executeToolWithRetry(
                name,
                input,
                context,
                traceId,
                reporter,
                () => {
                  retryCount += 1;
                },
              );
              this.logger.log(
                `[${traceId}] tool result name=${name} write=${isWriteOperation} patchDelta=${toolResult.patchDelta?.length ?? 0} totalPatch=${context.accumulatedPatch.length}`,
              );
              return toolResult.data ?? { ok: true };
            } catch (error) {
              this.logger.error(
                `[${traceId}] tool error name=${name} write=${isWriteOperation} ${this.summarizeToolError(error)}`,
                error instanceof Error ? error.stack : undefined,
              );
              throw error;
            }
          },
          onStepFinish: (event) => {
            metrics.stepCount = Math.max(metrics.stepCount, event.stepNumber + 1);
            this.logger.log(
              `[${traceId}] step=${event.stepNumber} finishReason=${event.finishReason} toolCalls=${event.toolCalls.length}`,
            );
          },
          onToolCallStart: (event) => {
            metrics.toolCallCount += 1;
            void reporter.emitStatus({
              stage: 'calling_tool',
              label: `正在执行工具 ${event.toolCall.toolName}`,
              toolName: event.toolCall.toolName,
              stepNumber: event.stepNumber,
              targetId: resolvedSelectedId,
            });
          },
          onToolCallFinish: (event) => {
            this.logger.log(
              `[${traceId}] tool finish step=${event.stepNumber ?? 0} name=${event.toolCall.toolName} success=${event.success} totalPatch=${context.accumulatedPatch.length}`,
            );
          },
        });

        metrics.stepCount = Math.max(metrics.stepCount, result.steps.length);
        metrics.toolCallCount = Math.max(metrics.toolCallCount, result.toolCallCount);
        finishReason = result.finishReason;
      }

      await reporter.emitStatus({
        stage: 'validating_output',
        label: '正在校验和预览 patch',
        targetId: resolvedSelectedId,
      });

      const { patch, previewSchema, previewSummary, changeGroups, risk } = await this.finalizePatch(
        dto,
        context,
        traceId,
        resolvedSelectedId,
        selectedProfile,
        reporter,
        () => {
          retryCount += 1;
        },
      );

      this.logger.log(
        `[${traceId}] finish reason=${finishReason} steps=${metrics.stepCount} toolCalls=${metrics.toolCallCount} patchOps=${patch.length}`,
      );

      await reporter.emitStatus({
        stage: 'completed',
        label: 'Patch 预览完成',
        finishReason,
        targetId: resolvedSelectedId,
      });

      return {
        mode: 'patch',
        pageId: context.pageId,
        baseVersion: dto.version,
        resolvedVersion: context.resolvedVersion,
        resolvedSelectedId,
        patch,
        previewSchema,
        previewSummary,
        changeGroups,
        risk,
        requiresConfirmation: risk.requiresConfirmation,
        warnings: [...context.warnings],
        traceId,
        route: options?.routeDecision?.route ?? {
          requestedMode: dto.responseMode ?? 'patch',
          resolvedMode: 'patch',
          reason: 'manual_patch',
          manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
        },
        retryCount,
      };
    } catch (error) {
      if (error instanceof AgentToolException) {
        throw error;
      }

      if (error instanceof AIToolCallingError) {
        if (error.reason === 'timeout') {
          this.policyService.throwTimeout(traceId, metrics);
        }

        this.policyService.throwPolicyBlocked(traceId, error.message, error.details);
      }

      throw error;
    }
  }

  private async resolveTarget(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    prefetchedFocusContext?: FocusContextResult,
    routeDecision?: AgentRouteDecision,
  ): Promise<
    | { resolvedSelectedId?: string; focusContextResult: FocusContextResult }
    | { clarificationResponse: AgentEditClarificationResponse }
  > {
    const initialResult =
      prefetchedFocusContext ??
      (await this.toolExecutionService.getFocusContext(context, dto.selectedId, dto.instruction));

    if (dto.selectedId && initialResult.mode === 'focused' && initialResult.context) {
      this.logger.log(`[${context.traceId}] target resolved from selectedId=${dto.selectedId}`);
      return {
        resolvedSelectedId: initialResult.context.focusNode.id,
        focusContextResult: initialResult,
      };
    }

    if (initialResult.mode === 'focused' && initialResult.context) {
      return {
        resolvedSelectedId: initialResult.context.focusNode.id,
        focusContextResult: initialResult,
      };
    }

    const candidates = initialResult.candidates ?? [];
    if (candidates.length === 0) {
      throw new AgentToolException({
        code: 'NODE_NOT_FOUND',
        message: 'No matching component could be resolved from the instruction',
        traceId: context.traceId,
        details: {
          selectedId: dto.selectedId,
          instruction: dto.instruction,
        },
      });
    }

    const topCandidate = candidates[0];
    const secondCandidate = candidates[1];
    const scoreGap = secondCandidate ? topCandidate.score - secondCandidate.score : 1;

    if (topCandidate.score >= 0.45 && scoreGap >= 0.15) {
      const focusedResult = await this.toolExecutionService.getFocusContext(
        context,
        topCandidate.id,
        dto.instruction,
      );
      this.logger.log(
        `[${context.traceId}] target auto-resolved to ${topCandidate.id} score=${topCandidate.score}`,
      );

      return {
        resolvedSelectedId: topCandidate.id,
        focusContextResult: focusedResult,
      };
    }

    const clarificationCandidates = this.buildClarificationCandidates(
      candidates.slice(0, CLARIFICATION_CANDIDATE_LIMIT),
      initialResult.schema,
    );

    return {
      clarificationResponse: {
        mode: 'clarification',
        content: `我找到了多个可能的目标组件：${clarificationCandidates
          .map((candidate) => this.buildClarificationSummary(candidate))
          .join('、')}。请选择你要修改的对象。`,
        question: '请选择要继续编辑的目标组件',
        clarificationId: `${traceId}-clarify`,
        candidates: clarificationCandidates,
        warnings: [],
        traceId,
        route: routeDecision?.route ?? {
          requestedMode: dto.responseMode ?? 'patch',
          resolvedMode: 'patch',
          reason: 'candidate_target',
          manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
        },
      },
    };
  }

  private buildSystemPrompt(componentList: readonly string[]): string {
    const allowedActionTypes = getCoreActionTypes().filter((type) => type !== 'customScript');

    return [
      '你是一个受限的低代码页面编辑 Agent。',
      '你只能通过工具读取页面信息并生成最小 patch；不要输出整页 schema，不要编造不存在的组件 ID。',
      '优先做局部修改，尽量复用已有组件和结构。',
      '禁止生成 customScript。',
      `可用组件类型: ${componentList.join(', ') || '未知'}`,
      `允许的事件 Action 类型: ${allowedActionTypes.join(', ')}`,
      "feedback 动作必须使用 content/level 字段，例如 { type: 'feedback', kind: 'message', content: '操作成功', level: 'success' }；不要使用 message/type_/messageType。",
      'Button 的红色/危险样式请设置 props.danger=true；不要把 Button.props.type 写成 danger，type 仅用于 default/primary/dashed/link/text。',
      '如果你已经完成修改，就停止继续调用工具。',
    ].join('\n');
  }

  private buildPrompt(
    dto: AgentEditRequestDto,
    focusContextResult: FocusContextResult,
    resolvedSelectedId?: string,
    conversationContext?: AgentConversationContext,
  ): string {
    const chunks = buildCompactContextSections(focusContextResult);

    if (resolvedSelectedId) {
      chunks.push(`默认编辑目标组件: ${resolvedSelectedId}`);
    }

    if (conversationContext?.summary) {
      chunks.push(`会话摘要:\n${conversationContext.summary}`);
    }

    const conversationHistory = (dto.conversationHistory || [])
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-4)
      .map(
        (message) =>
          `${message.role}: ${sanitizePromptText(message.content, MAX_HISTORY_MESSAGE_CHARS)}`,
      );

    if (conversationHistory.length > 0) {
      chunks.push(`最近对话:\n${conversationHistory.join('\n')}`);
    }

    chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
    chunks.push(
      [
        '建议策略:',
        '1. 简单文案或属性修改优先调用 update_component_props。',
        '2. 绑定事件使用 bind_event，并只替换目标 trigger 的 action 列表。',
        '3. 新增组件使用 insert_component，组件需带 id/type。',
        '4. 删除或移动前确认目标组件明确。',
      ].join('\n'),
    );

    return chunks.join('\n\n');
  }

  private hasCollectionIntent(instruction: string): boolean {
    return COLLECTION_INTENT_REGEX.test(instruction.trim());
  }

  private buildCollectionContainerClarification(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    routeDecision?: AgentRouteDecision,
  ): AgentEditClarificationResponse | undefined {
    const selectedId = dto.selectedId?.trim();
    if (!selectedId) {
      return this.createCollectionClarificationResponse(
        dto,
        traceId,
        routeDecision,
        '批量修改需要先选中父级或祖先容器，请先在编辑器中选中一个容器后再继续。',
      );
    }

    const selectedComponent = context.workingSchema.components[selectedId];
    if (!selectedComponent || !this.componentMetaRegistry.isContainer(selectedComponent.type)) {
      return this.createCollectionClarificationResponse(
        dto,
        traceId,
        routeDecision,
        '当前选中目标不是容器。请先选中要批量修改范围的父级或祖先容器，再继续发起批量修改。',
      );
    }

    return undefined;
  }

  private createCollectionClarificationResponse(
    dto: AgentEditRequestDto,
    traceId: string,
    routeDecision: AgentRouteDecision | undefined,
    content: string,
  ): AgentEditClarificationResponse {
    return {
      mode: 'clarification',
      content,
      question: '请先选中父级或祖先容器',
      clarificationId: `${traceId}-collection-clarify`,
      candidates: [],
      warnings: [],
      traceId,
      route: routeDecision?.route ?? {
        requestedMode: dto.responseMode ?? 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
      },
    };
  }

  private async createIntentConfirmationResponse(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    reporter: AgentProgressReporter,
    routeDecision: AgentRouteDecision | undefined,
    options: NormalizedIntentOption[],
  ): Promise<AgentEditIntentConfirmationResponse> {
    if (!resolvedSelectedId || !dto.sessionId?.trim()) {
      this.policyService.throwPolicyBlocked(traceId, '语义确认需要有效的会话与容器范围');
    }

    const pendingIntent = this.intentConfirmationService.create({
      sessionId: dto.sessionId,
      instruction: dto.instruction,
      pageId: dto.pageId,
      rootId: resolvedSelectedId,
      options,
      traceId,
    });
    const responseOptions: AgentIntentConfirmationOption[] = pendingIntent.options.map((option) => ({
      intentId: option.intentId,
      label: option.label,
      description: option.description,
    }));

    await reporter.emitStatus({
      stage: 'awaiting_intent_confirmation',
      label: '已识别到多种可能语义，等待确认',
      targetId: resolvedSelectedId,
      detail: responseOptions.map((option) => option.label).join(' / '),
    });

    return {
      mode: 'intent_confirmation',
      content: `我还需要先确认你的意思。当前“${dto.instruction.trim()}”在这个容器里可能对应多种集合语义，请先选择你要统一修改的那一类组件。`,
      question: '请先确认你说的是哪一类组件',
      intentConfirmationId: pendingIntent.intentConfirmationId,
      options: responseOptions,
      warnings: [...context.warnings],
      traceId,
      route: routeDecision?.route ?? {
        requestedMode: dto.responseMode ?? 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
      },
    };
  }

  private async runConfirmedIntentScopePlanning(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    reporter: AgentProgressReporter,
    routeDecision: AgentRouteDecision | undefined,
  ): Promise<AgentEditScopeConfirmationResponse> {
    const confirmedIntentId = dto.confirmedIntentId?.trim();
    const sessionId = dto.sessionId?.trim();
    if (!confirmedIntentId || !sessionId || !resolvedSelectedId) {
      this.policyService.throwPolicyBlocked(traceId, '语义确认参数不完整，请重新发起批量修改');
    }

    const confirmedIntent = this.intentConfirmationService.getConfirmedOption(sessionId, confirmedIntentId);
    if (!confirmedIntent) {
      this.policyService.throwPolicyBlocked(traceId, '语义确认已失效，请重新发起批量修改');
    }

    if (dto.instruction.trim() !== confirmedIntent.pending.instruction) {
      this.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
      this.policyService.throwPolicyBlocked(traceId, '语义确认与当前指令不一致，请重新发起批量修改');
    }

    if (dto.pageId !== confirmedIntent.pending.pageId) {
      this.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
      this.policyService.throwPolicyBlocked(traceId, '语义确认对应的页面已变化，请重新发起批量修改');
    }

    if (
      dto.selectedId?.trim() !== confirmedIntent.pending.rootId ||
      resolvedSelectedId !== confirmedIntent.pending.rootId
    ) {
      this.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
      this.policyService.throwPolicyBlocked(traceId, '当前选中容器已变化，请重新发起批量修改');
    }

    this.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);

    return this.planBatchScopeForIntent(
      dto,
      context,
      traceId,
      resolvedSelectedId,
      reporter,
      routeDecision,
      confirmedIntent.option,
      '正在根据已确认语义解析批量范围',
    );
  }

  private async planBatchScopeForIntent(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    reporter: AgentProgressReporter,
    routeDecision: AgentRouteDecision | undefined,
    intent: Pick<NormalizedIntentOption, 'targetType' | 'label'>,
    label: string,
  ): Promise<AgentEditScopeConfirmationResponse> {
    if (!resolvedSelectedId || !dto.sessionId?.trim()) {
      this.policyService.throwPolicyBlocked(traceId, '批量修改需要有效的会话与容器范围');
    }

    await reporter.emitStatus({
      stage: 'planning_scope',
      label,
      targetId: resolvedSelectedId,
      detail: `语义: ${intent.label}`,
    });

    const toolResult = await this.executeToolWithRetry(
      'resolve_collection_scope',
      {
        rootId: resolvedSelectedId,
        instruction: dto.instruction,
        targetType: intent.targetType,
      },
      context,
      traceId,
      reporter,
    );
    const resolvedScope = toolResult.data as CollectionTargetResolution | undefined;
    if (!resolvedScope || resolvedScope.status !== 'matched') {
      this.policyService.throwPolicyBlocked(
        traceId,
        this.describeCollectionResolutionFailure(
          resolvedScope ?? {
            status: 'no_match',
            rootId: resolvedSelectedId,
            reason: `未找到 ${intent.label}`,
          },
        ),
      );
    }

    await reporter.emitStatus({
      stage: 'awaiting_scope_confirmation',
      label: '已识别批量范围，等待用户确认',
      targetId: resolvedSelectedId,
      detail: `${resolvedScope.targetCount} 个 ${resolvedScope.matchedDisplayName}`,
    });

    return this.createScopeConfirmationResponse(
      dto,
      traceId,
      resolvedSelectedId,
      routeDecision,
      context,
      resolvedScope,
    );
  }

  private async createScopeConfirmationResponse(
    dto: AgentEditRequestDto,
    traceId: string,
    resolvedSelectedId: string,
    routeDecision: AgentRouteDecision | undefined,
    context: ToolExecutionContext,
    resolvedScope: Extract<CollectionTargetResolution, { status: 'matched' }>,
  ): Promise<AgentEditScopeConfirmationResponse> {
    const scope: AgentCollectionScope = {
      rootId: resolvedScope.rootId,
      matchedType: resolvedScope.matchedType,
      matchedDisplayName: resolvedScope.matchedDisplayName,
      targetIds: [...resolvedScope.componentIds],
      targetCount: resolvedScope.targetCount,
    };

    const pendingScope = this.scopeConfirmationService.create({
      sessionId: dto.sessionId!,
      instruction: dto.instruction,
      pageId: dto.pageId,
      rootId: resolvedSelectedId,
      scope,
      traceId,
    });

    return {
      mode: 'scope_confirmation',
      content: `已识别到当前容器下 ${scope.targetCount} 个${scope.matchedDisplayName}，请先确认这批组件是否就是你要统一修改的范围。`,
      question: `确认修改当前容器下的 ${scope.targetCount} 个${scope.matchedDisplayName}`,
      scopeConfirmationId: pendingScope.scopeConfirmationId,
      scope,
      warnings: [...context.warnings],
      traceId,
      route: routeDecision?.route ?? {
        requestedMode: dto.responseMode ?? 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
      },
    };
  }

  private async runBatchScopePlanning(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    focusContextResult: FocusContextResult,
    reporter: AgentProgressReporter,
    conversationContext: AgentConversationContext | undefined,
    routeDecision: AgentRouteDecision | undefined,
  ): Promise<AgentEditScopeConfirmationResponse> {
    if (!resolvedSelectedId || !dto.sessionId?.trim()) {
      this.policyService.throwPolicyBlocked(traceId, '批量修改需要有效的会话与容器范围');
    }

    const limits = this.policyService.getLimits('batch_patch');
    const agentTools = this.getToolDefinitions(BATCH_SCOPE_TOOL_NAMES);
    let resolvedScope: CollectionTargetResolution | undefined;

    await reporter.emitStatus({
      stage: 'planning_scope',
      label: '正在规划批量修改范围',
      targetId: resolvedSelectedId,
    });

    try {
      await this.aiService.runToolCalling({
        system: this.buildBatchScopeSystemPrompt(
          focusContextResult.componentList,
          resolvedSelectedId,
        ),
        prompt: this.buildBatchScopePrompt(
          dto,
          focusContextResult,
          resolvedSelectedId,
          conversationContext,
        ),
        provider: dto.provider,
        modelId: dto.modelId,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        timeoutMs: limits.timeoutMs,
        maxSteps: limits.maxSteps,
        maxToolCalls: limits.maxToolCalls,
        toolDefinitions: agentTools,
        executeTool: async (name, input) => {
          if (!BATCH_SCOPE_TOOL_NAMES.has(name)) {
            this.policyService.throwPolicyBlocked(
              traceId,
              `批量范围规划阶段不允许调用工具 ${name}`,
            );
          }

          if (name === 'resolve_collection_scope') {
            const requestedRootId = typeof input.rootId === 'string' ? input.rootId.trim() : '';
            if (requestedRootId !== resolvedSelectedId) {
              this.policyService.throwPolicyBlocked(
                traceId,
                '批量范围规划必须显式使用当前选中的容器 ID 作为 rootId',
                {
                  requestedRootId,
                  resolvedSelectedId,
                },
              );
            }
          }

          const toolResult = await this.executeToolWithRetry(name, input, context, traceId, reporter);
          if (name === 'resolve_collection_scope') {
            resolvedScope = toolResult.data as CollectionTargetResolution | undefined;
          }
          return toolResult.data ?? { ok: true };
        },
        onToolCallStart: (event) => {
          void reporter.emitStatus({
            stage: 'calling_tool',
            label: `正在执行工具 ${event.toolCall.toolName}`,
            toolName: event.toolCall.toolName,
            targetId: resolvedSelectedId,
            stepNumber: event.stepNumber,
          });
        },
      });
    } catch (error) {
      if (error instanceof AgentToolException) {
        throw error;
      }
      if (error instanceof AIToolCallingError) {
        this.policyService.throwPolicyBlocked(traceId, error.message, error.details);
      }
      throw error;
    }

    if (!resolvedScope) {
      this.policyService.throwPolicyBlocked(
        traceId,
        '批量修改必须先解析稳定的范围，请重新明确目标类型后再试',
      );
    }

    if (resolvedScope.status !== 'matched') {
      this.policyService.throwPolicyBlocked(
        traceId,
        this.describeCollectionResolutionFailure(resolvedScope),
      );
    }

    await reporter.emitStatus({
      stage: 'awaiting_scope_confirmation',
      label: '已识别批量范围，等待用户确认',
      targetId: resolvedSelectedId,
      detail: `${resolvedScope.targetCount} 个 ${resolvedScope.matchedDisplayName}`,
    });

    return this.createScopeConfirmationResponse(
      dto,
      traceId,
      resolvedSelectedId,
      routeDecision,
      context,
      resolvedScope,
    );
  }

  private async runConfirmedBatchPatch(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    focusContextResult: FocusContextResult,
    reporter: AgentProgressReporter,
    conversationContext: AgentConversationContext | undefined,
    routeDecision: AgentRouteDecision | undefined,
  ): Promise<AgentEditPatchResponse> {
    const confirmedScopeId = dto.confirmedScopeId?.trim();
    const sessionId = dto.sessionId?.trim();
    if (!confirmedScopeId || !sessionId || !resolvedSelectedId) {
      this.policyService.throwPolicyBlocked(traceId, '批量范围确认参数不完整');
    }

    const pendingScope = this.scopeConfirmationService.get(sessionId, confirmedScopeId);
    if (!pendingScope) {
      this.policyService.throwPolicyBlocked(traceId, '批量范围确认已失效，请重新发起批量修改');
    }

    if (dto.instruction.trim() !== pendingScope.instruction) {
      this.scopeConfirmationService.clear(sessionId);
      this.policyService.throwPolicyBlocked(traceId, '批量范围确认与当前指令不一致，请重新发起');
    }

    if (dto.pageId !== pendingScope.pageId) {
      this.scopeConfirmationService.clear(sessionId);
      this.policyService.throwPolicyBlocked(traceId, '批量范围确认对应的页面已变化，请重新发起');
    }

    if (
      dto.selectedId?.trim() !== pendingScope.rootId ||
      resolvedSelectedId !== pendingScope.rootId
    ) {
      this.scopeConfirmationService.clear(sessionId);
      this.policyService.throwPolicyBlocked(traceId, '当前选中容器已变化，请重新发起批量修改');
    }

    const revalidatedScope = this.collectionTargetResolver.resolve({
      rootId: pendingScope.rootId,
      instruction: pendingScope.instruction,
      schema: context.workingSchema,
    });

    if (
      revalidatedScope.status !== 'matched' ||
      !this.areStringSetsEqual(revalidatedScope.componentIds, pendingScope.scope.targetIds)
    ) {
      this.scopeConfirmationService.clear(sessionId);
      this.policyService.throwPolicyBlocked(
        traceId,
        '页面结构已变化，批量范围确认已失效，请重新发起',
      );
    }

    this.scopeConfirmationService.clear(sessionId);

    const limits = this.policyService.getLimits('batch_patch');
    const agentTools = this.getToolDefinitions(BATCH_PATCH_TOOL_NAMES);
    const metrics: AgentRunMetrics = { stepCount: 0, toolCallCount: 0 };
    let retryCount = 0;

    await reporter.emitStatus({
      stage: 'calling_model',
      label: '正在生成批量修改预览',
      targetId: resolvedSelectedId,
      detail: `范围: ${pendingScope.scope.targetCount} 个 ${pendingScope.scope.matchedDisplayName}`,
    });

    try {
      const result = await this.aiService.runToolCalling({
        system: this.buildBatchPatchSystemPrompt(
          focusContextResult.componentList,
          pendingScope.scope,
        ),
        prompt: this.buildBatchPatchPrompt(
          dto,
          focusContextResult,
          pendingScope.scope,
          conversationContext,
        ),
        provider: dto.provider,
        modelId: dto.modelId,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        timeoutMs: limits.timeoutMs,
        maxSteps: limits.maxSteps,
        maxToolCalls: limits.maxToolCalls,
        toolDefinitions: agentTools,
        executeTool: async (name, input) => {
          if (!BATCH_PATCH_TOOL_NAMES.has(name)) {
            this.policyService.throwPolicyBlocked(traceId, `批量 patch 阶段不允许调用工具 ${name}`);
          }

          if (name === 'update_components_props') {
            this.assertBatchToolTargets(traceId, input, pendingScope.scope);
          }

          const toolResult = await this.executeToolWithRetry(name, input, context, traceId, reporter, () => {
            retryCount += 1;
          });
          return toolResult.data ?? { ok: true };
        },
        onStepFinish: (event) => {
          metrics.stepCount = Math.max(metrics.stepCount, event.stepNumber + 1);
        },
        onToolCallStart: (event) => {
          metrics.toolCallCount += 1;
          void reporter.emitStatus({
            stage: 'calling_tool',
            label: `正在执行工具 ${event.toolCall.toolName}`,
            toolName: event.toolCall.toolName,
            stepNumber: event.stepNumber,
            targetId: resolvedSelectedId,
          });
        },
      });

      metrics.stepCount = Math.max(metrics.stepCount, result.steps.length);
      metrics.toolCallCount = Math.max(metrics.toolCallCount, result.toolCallCount);
    } catch (error) {
      if (error instanceof AgentToolException) {
        throw error;
      }

      if (error instanceof AIToolCallingError) {
        if (error.reason === 'timeout') {
          this.policyService.throwTimeout(traceId, metrics);
        }

        this.policyService.throwPolicyBlocked(traceId, error.message, error.details);
      }

      throw error;
    }

    await reporter.emitStatus({
      stage: 'validating_output',
      label: '正在校验和预览批量 patch',
      targetId: resolvedSelectedId,
    });

    const { patch, previewSchema, previewSummary, changeGroups, risk, scopeSummary } =
      await this.finalizePatch(
        dto,
        context,
        traceId,
        resolvedSelectedId,
        'batch_patch',
        reporter,
        () => {
          retryCount += 1;
        },
        pendingScope.scope,
      );

    await reporter.emitStatus({
      stage: 'completed',
      label: '批量修改预览已生成',
      targetId: resolvedSelectedId,
    });

    return {
      mode: 'patch',
      pageId: context.pageId,
      baseVersion: dto.version,
      resolvedVersion: context.resolvedVersion,
      resolvedSelectedId,
      patch,
      previewSchema,
      previewSummary,
      changeGroups,
      risk,
      requiresConfirmation: risk.requiresConfirmation,
      warnings: [...context.warnings],
      traceId,
      route: routeDecision?.route ?? {
        requestedMode: dto.responseMode ?? 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: (dto.responseMode ?? 'patch') !== 'auto',
      },
      retryCount,
      scopeSummary,
    };
  }

  private buildBatchScopeSystemPrompt(componentList: readonly string[], rootId: string): string {
    return [
      '你正在执行批量修改的范围规划阶段。',
      '本阶段不能生成 patch，也不能调用任何写工具。',
      `当前选中的容器 rootId=${rootId}。`,
      '如果用户要做集合修改，你必须调用 resolve_collection_scope。',
      '调用 resolve_collection_scope 时，rootId 必须等于当前选中的容器 ID。',
      `可用组件类型: ${componentList.join(', ') || '未知'}`,
      '当 resolve_collection_scope 返回 matched 后即可停止。',
    ].join('\n');
  }

  private buildBatchScopePrompt(
    dto: AgentEditRequestDto,
    focusContextResult: FocusContextResult,
    resolvedSelectedId: string,
    conversationContext?: AgentConversationContext,
  ): string {
    const chunks = buildCompactContextSections(focusContextResult);
    chunks.push(`当前已选中的容器: ${resolvedSelectedId}`);
    chunks.push('当前是批量修改第一阶段，请只规划范围，不要生成 patch。');

    if (conversationContext?.summary) {
      chunks.push(`会话摘要:\n${conversationContext.summary}`);
    }

    chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
    chunks.push('你必须先调用 resolve_collection_scope(rootId=当前容器ID)。');

    return chunks.join('\n\n');
  }

  private buildBatchPatchSystemPrompt(
    componentList: readonly string[],
    scope: AgentCollectionScope,
  ): string {
    return [
      '你正在执行批量修改的 patch 生成阶段。',
      '范围已经由用户确认，不能自行扩展目标集合。',
      `已确认 rootId=${scope.rootId}。`,
      `已确认目标类型=${scope.matchedType} (${scope.matchedDisplayName})。`,
      `已确认目标数量=${scope.targetCount}。`,
      `可用组件类型: ${componentList.join(', ') || '未知'}`,
      '你只能对已确认 targetIds 做统一 props 更新。',
      '禁止插入、删除、移动组件，禁止绑定事件。',
      '优先使用 update_components_props 一次完成批量更新。',
    ].join('\n');
  }

  private buildBatchPatchPrompt(
    dto: AgentEditRequestDto,
    focusContextResult: FocusContextResult,
    scope: AgentCollectionScope,
    conversationContext?: AgentConversationContext,
  ): string {
    const chunks = buildCompactContextSections(focusContextResult);

    if (conversationContext?.summary) {
      chunks.push(`会话摘要:\n${conversationContext.summary}`);
    }

    chunks.push(`用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`);
    chunks.push(`已确认 rootId: ${scope.rootId}`);
    chunks.push(`已确认目标类型: ${scope.matchedDisplayName} (${scope.matchedType})`);
    chunks.push(`已确认 targetIds: ${scope.targetIds.join(', ')}`);
    chunks.push('只能修改这些 targetIds，且只能生成统一 props 更新。');

    return chunks.join('\n\n');
  }

  private describeCollectionResolutionFailure(
    resolution: Exclude<CollectionTargetResolution, { status: 'matched' }>,
  ): string {
    switch (resolution.status) {
      case 'ambiguous':
        return resolution.reason;
      case 'over_limit':
        return resolution.reason;
      case 'no_match':
      default:
        return resolution.reason;
    }
  }

  private getToolDefinitions(toolNames: ReadonlySet<string>): ToolDefinition[] {
    return this.toolRegistry
      .listDefinitions('agent')
      .filter((definition) => toolNames.has(definition.name));
  }

  private assertBatchToolTargets(
    traceId: string,
    input: Record<string, unknown>,
    scope: AgentCollectionScope,
  ) {
    const componentIds = this.readStringArray(input.componentIds);
    if (!this.areStringSetsEqual(componentIds, scope.targetIds)) {
      this.policyService.throwPolicyBlocked(traceId, '批量 patch 阶段只能修改已确认的目标集合', {
        componentIds,
        expectedTargetIds: scope.targetIds,
      });
    }
  }

  private async finalizePatch(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    profile: AgentPatchRunProfile,
    reporter: AgentProgressReporter,
    onRetry: () => void,
    confirmedScope?: AgentCollectionScope,
  ): Promise<{
    patch: EditorPatchOperation[];
    previewSchema: ToolExecutionContext['workingSchema'];
    previewSummary: string;
    changeGroups: ReturnType<typeof buildPatchPresentation>['changeGroups'];
    risk: ReturnType<typeof buildPatchPresentation>['risk'];
    scopeSummary?: AgentPatchScopeSummary;
  }> {
    const guardContext = this.createGuardContext(context);
    const baseSchema = guardContext.workingSchema;
    const rawPatch = this.normalizeFinalPatch(baseSchema, context.accumulatedPatch);
    this.policyService.assertPatchProduced(rawPatch, traceId);
    this.policyService.assertPatchWithinLimits(rawPatch, traceId, profile);

    const autoFixResult = await this.executeToolWithRetry(
      'auto_fix_patch',
      { patch: rawPatch },
      guardContext,
      traceId,
      reporter,
      onRetry,
    );
    const autoFixedPatch = (
      (autoFixResult.data as { patch?: EditorPatchOperation[] } | undefined)?.patch ?? rawPatch
    ).map((operation) => ({ ...operation }));
    this.logger.log(
      `[${traceId}] auto-fix warnings=${autoFixResult.warnings?.length ?? 0} patchOps=${autoFixedPatch.length}`,
    );

    this.policyService.assertPatchProduced(autoFixedPatch, traceId);
    this.policyService.assertPatchWithinLimits(autoFixedPatch, traceId, profile);

    await reporter.emitStatus({
      stage: 'observing',
      label: '正在整理修改观察结果',
      targetId: resolvedSelectedId,
      detail: `命中 ${resolvedSelectedId ?? '未指定目标'}，预处理后 ${autoFixedPatch.length} 个 patch`,
    });

    const previewResult = await this.executeToolWithRetry(
      'preview_patch',
      { patch: autoFixedPatch },
      guardContext,
      traceId,
      reporter,
      onRetry,
    );
    const previewPatch = (
      (previewResult.data as { patch?: EditorPatchOperation[] } | undefined)?.patch ??
      autoFixedPatch
    ).map((operation) => ({ ...operation }));
    this.logger.log(
      `[${traceId}] preview warnings=${previewResult.warnings?.length ?? 0} patchOps=${previewPatch.length}`,
    );

    context.warnings.splice(0, context.warnings.length, ...guardContext.warnings);
    const previewArtifacts = buildPatchPresentation(
      baseSchema,
      guardContext.workingSchema,
      previewPatch,
    );
    this.assertInstructionConsistency(dto, previewPatch, traceId);

    let scopeSummary: AgentPatchScopeSummary | undefined;
    if (confirmedScope) {
      const changedTargetCount = this.assertBatchPatchConsistency(
        traceId,
        baseSchema,
        previewPatch,
        confirmedScope,
      );
      const unchangedCount = Math.max(0, confirmedScope.targetCount - changedTargetCount);
      if (unchangedCount > 0) {
        context.warnings.push(`有 ${unchangedCount} 个目标组件已是期望值，本次未重复生成 patch。`);
      }
      scopeSummary = {
        rootId: confirmedScope.rootId,
        matchedType: confirmedScope.matchedType,
        matchedDisplayName: confirmedScope.matchedDisplayName,
        targetCount: confirmedScope.targetCount,
        changedTargetCount,
      };
    }

    await reporter.emitStatus({
      stage: 'self_checking',
      label: '正在进行结构化自检',
      targetId: resolvedSelectedId,
      detail: `patch=${previewPatch.length}，target=${previewArtifacts.risk.distinctTargets}，risk=${previewArtifacts.risk.level}`,
    });

    return {
      patch: previewPatch,
      previewSchema: guardContext.workingSchema,
      previewSummary: previewArtifacts.previewSummary,
      changeGroups: previewArtifacts.changeGroups,
      risk: previewArtifacts.risk,
      scopeSummary,
    };
  }

  private async createExecutionContextWithRecovery(
    dto: AgentEditRequestDto,
    traceId: string,
    reporter: AgentProgressReporter,
  ): Promise<{ context: ToolExecutionContext; retryCount: number }> {
    try {
      return {
        context: await this.toolExecutionService.createExecutionContext(
          {
            pageId: dto.pageId,
            version: dto.version,
            draftSchema: dto.draftSchema,
          },
          traceId,
        ),
        retryCount: 0,
      };
    } catch (error) {
      const response =
        error instanceof AgentToolException
          ? ((error.getResponse() as { code?: string } | string) ?? undefined)
          : undefined;
      const errorCode = response && typeof response === 'object' ? response.code : undefined;
      if (
        error instanceof AgentToolException &&
        errorCode === 'PAGE_VERSION_CONFLICT' &&
        dto.pageId
      ) {
        this.traceService.markVersionConflict(traceId);
        await reporter.emitStatus({
          stage: 'retrying',
          label: '检测到版本冲突，正在基于最新页面重试',
        });
        return {
          context: await this.toolExecutionService.createExecutionContext(
            {
              pageId: dto.pageId,
            },
            traceId,
          ),
          retryCount: 1,
        };
      }

      throw error;
    }
  }

  private async tryFastPath(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    focusContextResult: FocusContextResult,
    resolvedSelectedId: string | undefined,
    profile: AgentPatchRunProfile,
    traceId: string,
    reporter: AgentProgressReporter,
  ): Promise<boolean> {
    if (
      profile !== 'fast_path' ||
      !resolvedSelectedId ||
      focusContextResult.mode !== 'focused' ||
      !focusContextResult.context
    ) {
      return false;
    }

    const focusNode = focusContextResult.context.focusNode;
    const textUpdate = this.extractSimpleTextUpdate(dto.instruction);
    if (textUpdate) {
      const textProp = this.componentMetaRegistry.getTextProps(focusNode.type)[0];
      if (textProp) {
        await reporter.emitStatus({
          stage: 'calling_tool',
          label: '正在执行简单任务快路径',
          toolName: 'update_component_props',
          targetId: resolvedSelectedId,
        });
        await this.executeToolWithRetry(
          'update_component_props',
          {
            componentId: resolvedSelectedId,
            props: { [textProp]: textUpdate },
          },
          context,
          traceId,
          reporter,
        );
        this.logger.log(`[${traceId}] fast-path text update target=${resolvedSelectedId}`);
        return true;
      }
    }

    const visibility = this.extractVisibilityUpdate(dto.instruction);
    if (visibility !== undefined) {
      await reporter.emitStatus({
        stage: 'calling_tool',
        label: '正在执行简单任务快路径',
        toolName: 'update_component_props',
        targetId: resolvedSelectedId,
      });
      await this.executeToolWithRetry(
        'update_component_props',
        {
          componentId: resolvedSelectedId,
          props: { visible: visibility },
        },
        context,
        traceId,
        reporter,
      );
      this.logger.log(`[${traceId}] fast-path visibility update target=${resolvedSelectedId}`);
      return true;
    }

    return false;
  }

  private async executeToolWithRetry(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    traceId: string,
    reporter?: AgentProgressReporter,
    onRetry?: () => void,
  ) {
    const executeOnce = async () => {
      const startedAt = Date.now();
      try {
        const result = await this.toolExecutionService.executeTool(name, input, context);
        this.traceService.recordToolCall(traceId, {
          toolName: name,
          toolInput: input,
          toolOutput: result.data ?? result.patchDelta ?? { ok: true },
          success: true,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        const parsedError = this.parseToolError(error);
        this.traceService.recordToolCall(traceId, {
          toolName: name,
          toolInput: input,
          success: false,
          durationMs: Date.now() - startedAt,
          errorCode: parsedError.code,
          errorMessage: parsedError.message,
        });
        throw error;
      }
    };

    try {
      return await executeOnce();
    } catch (error) {
      if (!READ_RETRYABLE_TOOLS.has(name)) {
        throw error;
      }

      await reporter?.emitStatus({
        stage: 'retrying',
        label: `工具 ${name} 失败，正在重试`,
        toolName: name,
      });
      onRetry?.();
      return executeOnce();
    }
  }

  private parseToolError(error: unknown): { code?: string; message: string } {
    if (error instanceof AgentToolException) {
      const response = error.getResponse() as { code?: string; message?: string } | string;
      if (typeof response === 'string') {
        return {
          message: response,
        };
      }
      return {
        code: response.code,
        message: response.message ?? error.message,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
      };
    }

    return {
      message: 'Unknown tool error',
    };
  }

  private normalizeFinalPatch(
    baseSchema: A2UISchema,
    patch: readonly EditorPatchOperation[],
  ): EditorPatchOperation[] {
    const parentMap = buildParentMap(baseSchema.components);
    const deduped: EditorPatchOperation[] = [];
    const seen = new Set<string>();

    for (const operation of patch) {
      const normalized = { ...operation };
      const key = JSON.stringify(normalized);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      switch (normalized.op) {
        case 'insertComponent': {
          const componentId =
            typeof normalized.component.id === 'string' ? normalized.component.id : undefined;
          if (componentId && baseSchema.components[componentId]) {
            continue;
          }
          break;
        }
        case 'updateProps': {
          const currentProps = baseSchema.components[normalized.componentId]?.props ?? {};
          const hasChange = Object.entries(normalized.props).some(
            ([keyName, value]) => JSON.stringify(currentProps[keyName]) !== JSON.stringify(value),
          );
          if (!hasChange) {
            continue;
          }
          break;
        }
        case 'bindEvent': {
          const currentActions =
            baseSchema.components[normalized.componentId]?.events?.[normalized.event] ?? [];
          if (JSON.stringify(currentActions) === JSON.stringify(normalized.actions)) {
            continue;
          }
          break;
        }
        case 'removeComponent':
          if (!baseSchema.components[normalized.componentId]) {
            continue;
          }
          break;
        case 'moveComponent': {
          const currentParentId = parentMap.get(normalized.componentId);
          const currentIndex =
            currentParentId === undefined
              ? -1
              : (baseSchema.components[currentParentId]?.childrenIds ?? []).indexOf(
                  normalized.componentId,
                );
          if (currentParentId === normalized.newParentId && currentIndex === normalized.newIndex) {
            continue;
          }
          break;
        }
      }

      deduped.push(normalized);
    }

    return deduped;
  }

  private assertInstructionConsistency(
    dto: AgentEditRequestDto,
    patch: readonly EditorPatchOperation[],
    traceId: string,
  ) {
    const normalizedInstruction = dto.instruction.trim().toLowerCase();
    if (!normalizedInstruction) {
      return;
    }

    const visibleUpdates = patch.filter(
      (operation): operation is Extract<EditorPatchOperation, { op: 'updateProps' }> =>
        operation.op === 'updateProps' &&
        Object.prototype.hasOwnProperty.call(operation.props, 'visible'),
    );

    if (
      normalizedInstruction.includes('隐藏') &&
      visibleUpdates.some((operation) => operation.props.visible === true)
    ) {
      this.policyService.throwPolicyBlocked(traceId, 'Patch result conflicts with hide intent', {
        instruction: dto.instruction,
      });
    }

    if (
      normalizedInstruction.includes('显示') &&
      visibleUpdates.some((operation) => operation.props.visible === false)
    ) {
      this.policyService.throwPolicyBlocked(traceId, 'Patch result conflicts with show intent', {
        instruction: dto.instruction,
      });
    }
  }

  private extractSimpleTextUpdate(instruction: string): string | undefined {
    const quoted =
      instruction.match(/[“"「](.+?)[”"」]\s*$/)?.[1] ??
      instruction.match(/(?:改成|改为|换成|变成|更新为)(.+)$/)?.[1];
    const normalized = quoted?.replace(/[。！!？?]/g, '').trim();
    return normalized ? normalized : undefined;
  }

  private extractVisibilityUpdate(instruction: string): boolean | undefined {
    const normalized = instruction.trim().toLowerCase();
    if (normalized.includes('隐藏')) {
      return false;
    }
    if (normalized.includes('显示')) {
      return true;
    }
    return undefined;
  }

  private createGuardContext(context: ToolExecutionContext): ToolExecutionContext {
    const baseSchema = context.draftSchema ?? context.workingSchema;
    return {
      ...context,
      draftSchema: baseSchema,
      workingSchema: baseSchema,
      accumulatedPatch: [],
      warnings: [...context.warnings],
    };
  }

  private isWriteTool(name: string): boolean {
    return (
      name === 'insert_component' ||
      name === 'update_component_props' ||
      name === 'update_components_props' ||
      name === 'bind_event' ||
      name === 'remove_component' ||
      name === 'move_component'
    );
  }

  private assertBatchPatchConsistency(
    traceId: string,
    baseSchema: A2UISchema,
    patch: readonly EditorPatchOperation[],
    scope: AgentCollectionScope,
  ): number {
    if (patch.some((operation) => operation.op !== 'updateProps')) {
      this.policyService.throwPolicyBlocked(traceId, '批量 patch 只允许生成 updateProps 操作');
    }

    const changedTargets = Array.from(
      new Set(
        patch
          .filter(
            (operation): operation is Extract<EditorPatchOperation, { op: 'updateProps' }> =>
              operation.op === 'updateProps',
          )
          .map((operation) => operation.componentId),
      ),
    );

    if (changedTargets.length === 0) {
      this.policyService.throwPolicyBlocked(traceId, '批量 patch 未产生有效的目标修改');
    }

    const expectedTargets = new Set(scope.targetIds);
    for (const targetId of changedTargets) {
      if (!expectedTargets.has(targetId)) {
        this.policyService.throwPolicyBlocked(traceId, '批量 patch 越出了已确认的目标范围', {
          targetId,
          expectedTargetIds: scope.targetIds,
        });
      }
    }

    const hasMissingTargetType = changedTargets.some(
      (targetId) => !baseSchema.components[targetId]?.type,
    );
    const targetTypes = new Set(
      changedTargets
        .map((targetId) => baseSchema.components[targetId]?.type)
        .filter((type): type is string => Boolean(type)),
    );
    if (hasMissingTargetType || targetTypes.size !== 1 || !targetTypes.has(scope.matchedType)) {
      this.policyService.throwPolicyBlocked(traceId, '批量 patch 不能混合修改多种组件类型', {
        targetTypes: Array.from(targetTypes),
        expectedType: scope.matchedType,
      });
    }

    return changedTargets.length;
  }

  private summarizeToolInput(input: Record<string, unknown>): string {
    try {
      const serialized = JSON.stringify(input);
      if (!serialized) {
        return '{}';
      }

      return serialized.length > 240 ? `${serialized.slice(0, 240)}...(truncated)` : serialized;
    } catch {
      return '[unserializable-input]';
    }
  }

  private summarizeToolError(error: unknown): string {
    if (error instanceof AgentToolException) {
      const response = error.getResponse() as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        traceId?: string;
      };
      const details = this.summarizeUnknownValue(response.details);
      return `code=${response.code ?? 'UNKNOWN'} message=${response.message ?? 'Unknown tool error'} details=${details}`;
    }

    if (error instanceof Error) {
      return `message=${error.message}`;
    }

    return `message=${this.summarizeUnknownValue(error)}`;
  }

  private summarizeUnknownValue(value: unknown): string {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return 'null';
      }

      return serialized.length > 240 ? `${serialized.slice(0, 240)}...(truncated)` : serialized;
    } catch {
      return '[unserializable-value]';
    }
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  }

  private areStringSetsEqual(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    const leftSet = new Set(left);
    const rightSet = new Set(right);
    if (leftSet.size !== rightSet.size) {
      return false;
    }

    return Array.from(leftSet).every((value) => rightSet.has(value));
  }

  private buildClarificationCandidates(
    candidates: readonly NodeCandidate[],
    schema: A2UISchema,
  ): AgentClarificationCandidate[] {
    const parentMap = buildParentMap(schema.components);
    return candidates.map((candidate) => {
      const component = schema.components[candidate.id];
      const secondaryLabel = this.getTypeLabel(candidate.type);
      const displayLabel =
        this.extractComponentLabel(component) ??
        this.buildFallbackDisplayLabel(candidate, schema, parentMap, secondaryLabel);

      return {
        id: candidate.id,
        type: candidate.type,
        score: candidate.score,
        reason: candidate.reason,
        displayLabel,
        secondaryLabel,
        pathLabel: component
          ? this.buildCandidatePathLabel(component.id, schema, parentMap)
          : undefined,
      };
    });
  }

  private buildClarificationSummary(candidate: AgentClarificationCandidate): string {
    return candidate.pathLabel
      ? `${candidate.displayLabel}（${candidate.pathLabel}）`
      : candidate.displayLabel;
  }

  private extractComponentLabel(component?: A2UIComponent): string | undefined {
    if (!component?.props) {
      return undefined;
    }

    const labelProps = Array.from(
      new Set([...this.componentMetaRegistry.getTextProps(component.type), ...DEFAULT_LABEL_PROPS]),
    );

    for (const propName of labelProps) {
      const normalized = this.normalizeDisplayText(component.props[propName], MAX_LABEL_CHARS);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private buildFallbackDisplayLabel(
    candidate: NodeCandidate,
    schema: A2UISchema,
    parentMap: ReadonlyMap<string, string>,
    secondaryLabel: string,
  ): string {
    const parentId = parentMap.get(candidate.id);
    if (!parentId) {
      return secondaryLabel;
    }

    const siblingIds = schema.components[parentId]?.childrenIds ?? [];
    const sameTypeSiblings = siblingIds.filter(
      (siblingId) => schema.components[siblingId]?.type === candidate.type,
    );
    const siblingIndex = sameTypeSiblings.indexOf(candidate.id);
    if (sameTypeSiblings.length > 1 && siblingIndex >= 0) {
      return `${secondaryLabel} #${siblingIndex + 1}`;
    }

    return secondaryLabel;
  }

  private buildCandidatePathLabel(
    componentId: string,
    schema: A2UISchema,
    parentMap: ReadonlyMap<string, string>,
  ): string | undefined {
    const ancestors = buildAncestorChain(componentId, parentMap, schema.components);
    if (ancestors.length === 0) {
      return undefined;
    }

    const segments = ancestors
      .map((ancestor) => {
        const component = schema.components[ancestor.id];
        return this.buildPathSegmentLabel(component, ancestor.type);
      })
      .filter((segment): segment is string => Boolean(segment));

    return segments.length > 0 ? segments.join(' > ') : undefined;
  }

  private buildPathSegmentLabel(component: A2UIComponent | undefined, type: string): string {
    const label = this.extractComponentLabel(component);
    if (label) {
      return this.normalizeDisplayText(label, MAX_PATH_SEGMENT_CHARS) ?? label;
    }

    return this.getTypeLabel(type);
  }

  private getTypeLabel(type: string): string {
    return this.componentMetaRegistry.getDisplayName(type) ?? type;
  }

  private normalizeDisplayText(value: unknown, maxLength: number): string | undefined {
    if (typeof value === 'number') {
      return String(value);
    }

    if (Array.isArray(value)) {
      const normalizedParts = value
        .map((item) => this.normalizeDisplayText(item, maxLength))
        .filter((item): item is string => Boolean(item));
      if (normalizedParts.length === 0) {
        return undefined;
      }
      return this.truncateDisplayText(normalizedParts.join(' / '), maxLength);
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }

    return this.truncateDisplayText(normalized, maxLength);
  }

  private truncateDisplayText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
  }
}
