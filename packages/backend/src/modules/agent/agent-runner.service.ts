import { Injectable, Logger } from '@nestjs/common';
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
  ComponentNode,
  PageSchema,
  FocusContextResult,
  NodeCandidate,
} from '../schema-context';
import { buildPatchPresentation } from './agent-preview.utils';
import {
  buildClarificationCandidates,
  buildClarificationSummary,
} from './agent-clarification.utils';
import { normalizeFinalPatch } from './agent-patch-normalizer.utils';
import { AgentIntentConfirmationService } from './agent-intent-confirmation.service';
import {
  AgentIntentNormalizationService,
  NormalizedIntentOption,
} from './agent-intent-normalization.service';
import { AgentScopeConfirmationService } from './agent-scope-confirmation.service';
import { AgentTraceService } from './agent-trace.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentConversationContext } from './agent-session-memory.service';
import { AgentPatchRunProfile, AgentPolicyService, AgentRunMetrics } from './agent-policy.service';
import { AgentProgressReporter, NOOP_AGENT_PROGRESS_REPORTER } from './types/agent-progress.types';
import {
  buildBatchPatchPrompt,
  buildBatchPatchSystemPrompt,
  buildBatchScopePrompt,
  buildBatchScopeSystemPrompt,
  buildPrompt,
  buildSystemPrompt,
} from './agent-prompt.builder';
import {
  buildCollectionContainerClarification,
  createCollectionClarificationResponse,
  createIntentConfirmationResponse,
  createScopeConfirmationResponse,
  planBatchScopeForIntent,
  runBatchScopePlanning,
  runConfirmedBatchPatch,
  runConfirmedIntentScopePlanning,
} from './agent-batch.planner';
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

export function isPageLogicInstruction(instruction: string): boolean {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('page state') ||
    normalized.includes('computed') ||
    normalized.includes('页面逻辑') ||
    normalized.includes('状态声明') ||
    normalized.includes('计算声明') ||
    normalized.includes('计算值')
  );
}

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
      executionPath?: 'auto' | 'tool_call';
      /** 仅供受控内部调用观测实际生效的预算 Profile，不进入 HTTP 协议。 */
      onExecutionProfile?: (profile: AgentPatchRunProfile) => void;
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
    const isLogicInstruction = isPageLogicInstruction(dto.instruction);
    const isCollectionIntent =
      !isLogicInstruction && (hasConfirmedIntent || this.hasCollectionIntent(dto.instruction));

    this.policyService.assertPatchRequestAllowed(dto, traceId);

    await reporter.emitStatus({
      stage: 'assembling_context',
      label: '正在准备页面上下文',
    });

    const recoveredContext = await this.createExecutionContextWithRecovery(dto, traceId, reporter);
    const context = recoveredContext.context;
    retryCount += recoveredContext.retryCount;

    this.logger.log(
      `[${traceId}] run start mode=patch pageId=${dto.pageId} version=${dto.pageVersion ?? 'n/a'}`,
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

    let resolvedSelectedId: string | undefined;
    let focusContextResult: FocusContextResult;

    if (isLogicInstruction) {
      // 页面级 Logic 指令：跳过集合意图分支与普通组件候选澄清；
      // 用页面 rootId 组装只读 focus context，但保持 resolvedSelectedId 为 undefined，防止组件 fast path 误改 root props
      focusContextResult = await this.toolExecutionService.getFocusContext(
        context,
        context.workingSchema.rootId,
        dto.instruction,
      );
      resolvedSelectedId = undefined;
    } else {
      await reporter.emitStatus({
        stage: 'resolving_target',
        label: '正在解析编辑目标',
      });

      const targetResolution = await this.resolveTarget(
        dto,
        context,
        traceId,
        recoveredContext.retryCount > 0
          ? undefined
          : options?.routeDecision?.prefetchedFocusContext,
        options?.routeDecision,
      );
      if ('clarificationResponse' in targetResolution) {
        await reporter.emitStatus({
          stage: 'completed',
          label: '需要用户澄清目标组件',
        });
        return targetResolution.clarificationResponse;
      }

      resolvedSelectedId = targetResolution.resolvedSelectedId;
      focusContextResult = targetResolution.focusContextResult;
    }
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
    const prompt = buildPrompt(
      dto,
      focusContextResult,
      resolvedSelectedId,
      options?.conversationContext,
    );

    try {
      let finishReason = 'fast_path';
      const fastPathApplied =
        options?.executionPath !== 'tool_call' &&
        (await this.tryFastPath(
          dto,
          context,
          focusContextResult,
          resolvedSelectedId,
          selectedProfile,
          traceId,
          reporter,
        ));
      // fast_path 被强制走 Tool Calling 或自然快速路径未命中时，实际预算收敛为 simple_patch。
      const effectiveProfile = fastPathApplied
        ? selectedProfile
        : selectedProfile === 'fast_path'
          ? 'simple_patch'
          : selectedProfile;
      options?.onExecutionProfile?.(effectiveProfile);

      if (fastPathApplied) {
        metrics.stepCount = 1;
        metrics.toolCallCount = Math.max(metrics.toolCallCount, 1);
      } else {
        const limits = this.policyService.getLimits(effectiveProfile);
        const agentTools = this.toolRegistry.listDefinitions('agent');

        await reporter.emitStatus({
          stage: 'calling_model',
          label: '正在调用模型规划编辑步骤',
          targetId: resolvedSelectedId,
          detail: `预算: ${effectiveProfile} / maxSteps=${limits.maxSteps} / maxToolCalls=${limits.maxToolCalls}`,
        });

        const result = await this.aiService.runToolCalling({
          system: buildSystemPrompt(focusContextResult.componentList),
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

      const { patch, previewSchema, previewSummary, changeGroups, risk, repairCount } =
        await this.finalizePatch(
          dto,
          context,
          traceId,
          resolvedSelectedId,
          effectiveProfile,
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
        basePageVersion: dto.pageVersion,
        resolvedPageVersion: context.resolvedPageVersion,
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
        repairCount,
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

    const clarificationCandidates = buildClarificationCandidates(
      candidates.slice(0, CLARIFICATION_CANDIDATE_LIMIT),
      initialResult.schema,
      this.componentMetaRegistry,
    );

    return {
      clarificationResponse: {
        mode: 'clarification',
        content: `我找到了多个可能的目标组件：${clarificationCandidates
          .map((candidate) => buildClarificationSummary(candidate))
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

  private hasCollectionIntent(instruction: string): boolean {
    return COLLECTION_INTENT_REGEX.test(instruction.trim());
  }

  private buildCollectionContainerClarification(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    routeDecision?: AgentRouteDecision,
  ): AgentEditClarificationResponse | undefined {
    return buildCollectionContainerClarification(this, dto, context, traceId, routeDecision);
  }

  private createCollectionClarificationResponse(
    dto: AgentEditRequestDto,
    traceId: string,
    routeDecision: AgentRouteDecision | undefined,
    content: string,
  ): AgentEditClarificationResponse {
    return createCollectionClarificationResponse(this, dto, traceId, routeDecision, content);
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
    return createIntentConfirmationResponse(
      this,
      dto,
      context,
      traceId,
      resolvedSelectedId,
      reporter,
      routeDecision,
      options,
    );
  }

  private async runConfirmedIntentScopePlanning(
    dto: AgentEditRequestDto,
    context: ToolExecutionContext,
    traceId: string,
    resolvedSelectedId: string | undefined,
    reporter: AgentProgressReporter,
    routeDecision: AgentRouteDecision | undefined,
  ): Promise<AgentEditScopeConfirmationResponse> {
    return runConfirmedIntentScopePlanning(
      this,
      dto,
      context,
      traceId,
      resolvedSelectedId,
      reporter,
      routeDecision,
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
    return planBatchScopeForIntent(
      this,
      dto,
      context,
      traceId,
      resolvedSelectedId,
      reporter,
      routeDecision,
      intent,
      label,
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
    return createScopeConfirmationResponse(
      this,
      dto,
      traceId,
      resolvedSelectedId,
      routeDecision,
      context,
      resolvedScope,
    );
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
    return runBatchScopePlanning(
      this,
      dto,
      context,
      traceId,
      resolvedSelectedId,
      focusContextResult,
      reporter,
      conversationContext,
      routeDecision,
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
    return runConfirmedBatchPatch(
      this,
      dto,
      context,
      traceId,
      resolvedSelectedId,
      focusContextResult,
      reporter,
      conversationContext,
      routeDecision,
    );
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
    repairCount: number;
    scopeSummary?: AgentPatchScopeSummary;
  }> {
    const guardContext = this.createGuardContext(context);
    const baseSchema = guardContext.workingSchema;
    const rawPatch = normalizeFinalPatch(baseSchema, context.accumulatedPatch);
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
    const autoFixData = autoFixResult.data as
      | { patch?: EditorPatchOperation[]; repairCount?: number }
      | undefined;
    const autoFixedPatch = (autoFixData?.patch ?? rawPatch).map((operation) => ({ ...operation }));
    const repairCount = autoFixData?.repairCount ?? 0;
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
      repairCount,
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
            basePageVersion: dto.pageVersion,
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
      name === 'move_component' ||
      name === 'replace_page_logic'
    );
  }

  private assertBatchPatchConsistency(
    traceId: string,
    baseSchema: PageSchema,
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
}
