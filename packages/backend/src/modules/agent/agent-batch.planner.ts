/**
 * Agent batch planner — batch scope/intent handling extracted from runner.
 */
// @ts-nocheck - batch planner extracted with host:any delegation, keep parity with runner

import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { AIToolCallingError } from '../ai/ai.service';
import type { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import type { ToolExecutionContext } from '../agent-tools/types/tool.types';
import type {
  AgentCollectionScope,
  AgentEditClarificationResponse,
  AgentEditIntentConfirmationResponse,
  AgentEditPatchResponse,
  AgentEditScopeConfirmationResponse,
  AgentIntentConfirmationOption,
  AgentRouteDecision,
} from './types/agent-edit.types';
import type { CollectionTargetResolution } from '../schema-context';
import type { FocusContextResult } from '../schema-context';
import type { AgentConversationContext } from './agent-session-memory.service';
import type { NormalizedIntentOption } from './agent-intent-normalization.service';
import { AgentProgressReporter } from './types/agent-progress.types';
import {
  buildBatchPatchPrompt,
  buildBatchPatchSystemPrompt,
  buildBatchScopePrompt,
  buildBatchScopeSystemPrompt,
} from './agent-prompt.builder';

const BATCH_SCOPE_TOOL_NAMES = new Set(['resolve_collection_scope', 'get_component_meta']);
const BATCH_PATCH_TOOL_NAMES = new Set(['update_components_props', 'get_component_meta']);

export function buildCollectionContainerClarification(
  host: any,
  dto: AgentEditRequestDto,
  context: ToolExecutionContext,
  traceId: string,
  routeDecision?: AgentRouteDecision,
): AgentEditClarificationResponse | undefined {
  const selectedId = dto.selectedId?.trim();
  if (!selectedId) {
    return createCollectionClarificationResponse(
      host,
      dto,
      traceId,
      routeDecision,
      '批量修改需要先选中父级或祖先容器，请先在编辑器中选中一个容器后再继续。',
    );
  }

  const selectedComponent = context.workingSchema.components[selectedId];
  if (!selectedComponent || !host.componentMetaRegistry.isContainer(selectedComponent.type)) {
    return createCollectionClarificationResponse(
      host,
      dto,
      traceId,
      routeDecision,
      '当前选中目标不是容器。请先选中要批量修改范围的父级或祖先容器，再继续发起批量修改。',
    );
  }

  return undefined;
}

export function createCollectionClarificationResponse(
  host: any,
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

export async function createIntentConfirmationResponse(
  host: any,
  dto: AgentEditRequestDto,
  context: ToolExecutionContext,
  traceId: string,
  resolvedSelectedId: string | undefined,
  reporter: AgentProgressReporter,
  routeDecision: AgentRouteDecision | undefined,
  options: NormalizedIntentOption[],
): Promise<AgentEditIntentConfirmationResponse> {
  if (!resolvedSelectedId || !dto.sessionId?.trim()) {
    host.policyService.throwPolicyBlocked(traceId, '语义确认需要有效的会话与容器范围');
  }

  const pendingIntent = host.intentConfirmationService.create({
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

export async function runConfirmedIntentScopePlanning(
  host: any,
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
    host.policyService.throwPolicyBlocked(traceId, '语义确认参数不完整，请重新发起批量修改');
  }

  const confirmedIntent = host.intentConfirmationService.getConfirmedOption(
    sessionId,
    confirmedIntentId,
  );
  if (!confirmedIntent) {
    host.policyService.throwPolicyBlocked(traceId, '语义确认已失效，请重新发起批量修改');
  }

  if (dto.instruction.trim() !== confirmedIntent.pending.instruction) {
    host.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
    host.policyService.throwPolicyBlocked(traceId, '语义确认与当前指令不一致，请重新发起批量修改');
  }

  if (dto.pageId !== confirmedIntent.pending.pageId) {
    host.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
    host.policyService.throwPolicyBlocked(traceId, '语义确认对应的页面已变化，请重新发起批量修改');
  }

  if (
    dto.selectedId?.trim() !== confirmedIntent.pending.rootId ||
    resolvedSelectedId !== confirmedIntent.pending.rootId
  ) {
    host.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);
    host.policyService.throwPolicyBlocked(traceId, '当前选中容器已变化，请重新发起批量修改');
  }

  host.intentConfirmationService.clear(sessionId, confirmedIntent.pending.intentConfirmationId);

  return planBatchScopeForIntent(
    host,
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

export async function planBatchScopeForIntent(
  host: any,
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
    host.policyService.throwPolicyBlocked(traceId, '批量修改需要有效的会话与容器范围');
  }

  await reporter.emitStatus({
    stage: 'planning_scope',
    label,
    targetId: resolvedSelectedId,
    detail: `语义: ${intent.label}`,
  });

  const toolResult = await host.executeToolWithRetry(
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
    host.policyService.throwPolicyBlocked(
      traceId,
      host.describeCollectionResolutionFailure(
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

  return createScopeConfirmationResponse(
    host,
    dto,
    traceId,
    resolvedSelectedId,
    routeDecision,
    context,
    resolvedScope,
  );
}

export async function createScopeConfirmationResponse(
  host: any,
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

  const pendingScope = host.scopeConfirmationService.create({
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

export async function runBatchScopePlanning(
  host: any,
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
    host.policyService.throwPolicyBlocked(traceId, '批量修改需要有效的会话与容器范围');
  }

  const limits = host.policyService.getLimits('batch_patch');
  const agentTools = host.getToolDefinitions(BATCH_SCOPE_TOOL_NAMES);
  let resolvedScope: CollectionTargetResolution | undefined;

  await reporter.emitStatus({
    stage: 'planning_scope',
    label: '正在规划批量修改范围',
    targetId: resolvedSelectedId,
  });

  try {
    await host.aiService.runToolCalling({
      system: buildBatchScopeSystemPrompt(focusContextResult.componentList, resolvedSelectedId),
      prompt: buildBatchScopePrompt(
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
          host.policyService.throwPolicyBlocked(traceId, `批量范围规划阶段不允许调用工具 ${name}`);
        }

        if (name === 'resolve_collection_scope') {
          const requestedRootId = typeof input.rootId === 'string' ? input.rootId.trim() : '';
          if (requestedRootId !== resolvedSelectedId) {
            host.policyService.throwPolicyBlocked(
              traceId,
              '批量范围规划必须显式使用当前选中的容器 ID 作为 rootId',
              {
                requestedRootId,
                resolvedSelectedId,
              },
            );
          }
        }

        const toolResult = await host.executeToolWithRetry(name, input, context, traceId, reporter);
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
      host.policyService.throwPolicyBlocked(traceId, error.message, error.details);
    }
    throw error;
  }

  if (!resolvedScope) {
    host.policyService.throwPolicyBlocked(
      traceId,
      '批量修改必须先解析稳定的范围，请重新明确目标类型后再试',
    );
  }

  if (resolvedScope.status !== 'matched') {
    host.policyService.throwPolicyBlocked(
      traceId,
      host.describeCollectionResolutionFailure(resolvedScope),
    );
  }

  await reporter.emitStatus({
    stage: 'awaiting_scope_confirmation',
    label: '已识别批量范围，等待用户确认',
    targetId: resolvedSelectedId,
    detail: `${resolvedScope.targetCount} 个 ${resolvedScope.matchedDisplayName}`,
  });

  return createScopeConfirmationResponse(
    host,
    dto,
    traceId,
    resolvedSelectedId,
    routeDecision,
    context,
    resolvedScope,
  );
}

export async function runConfirmedBatchPatch(
  host: any,
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
    host.policyService.throwPolicyBlocked(traceId, '批量范围确认参数不完整');
  }

  const pendingScope = host.scopeConfirmationService.get(sessionId, confirmedScopeId);
  if (!pendingScope) {
    host.policyService.throwPolicyBlocked(traceId, '批量范围确认已失效，请重新发起批量修改');
  }

  if (dto.instruction.trim() !== pendingScope.instruction) {
    host.scopeConfirmationService.clear(sessionId);
    host.policyService.throwPolicyBlocked(traceId, '批量范围确认与当前指令不一致，请重新发起');
  }

  if (dto.pageId !== pendingScope.pageId) {
    host.scopeConfirmationService.clear(sessionId);
    host.policyService.throwPolicyBlocked(traceId, '批量范围确认对应的页面已变化，请重新发起');
  }

  if (
    dto.selectedId?.trim() !== pendingScope.rootId ||
    resolvedSelectedId !== pendingScope.rootId
  ) {
    host.scopeConfirmationService.clear(sessionId);
    host.policyService.throwPolicyBlocked(traceId, '当前选中容器已变化，请重新发起批量修改');
  }

  const revalidatedScope = host.collectionTargetResolver.resolve({
    rootId: pendingScope.rootId,
    instruction: pendingScope.instruction,
    schema: context.workingSchema,
  });

  if (
    revalidatedScope.status !== 'matched' ||
    !host.areStringSetsEqual(revalidatedScope.componentIds, pendingScope.scope.targetIds)
  ) {
    host.scopeConfirmationService.clear(sessionId);
    host.policyService.throwPolicyBlocked(
      traceId,
      '页面结构已变化，批量范围确认已失效，请重新发起',
    );
  }

  host.scopeConfirmationService.clear(sessionId);

  const limits = host.policyService.getLimits('batch_patch');
  const agentTools = host.getToolDefinitions(BATCH_PATCH_TOOL_NAMES);
  const metrics: AgentRunMetrics = { stepCount: 0, toolCallCount: 0 };
  let retryCount = 0;

  await reporter.emitStatus({
    stage: 'calling_model',
    label: '正在生成批量修改预览',
    targetId: resolvedSelectedId,
    detail: `范围: ${pendingScope.scope.targetCount} 个 ${pendingScope.scope.matchedDisplayName}`,
  });

  try {
    const result = await host.aiService.runToolCalling({
      system: buildBatchPatchSystemPrompt(focusContextResult.componentList, pendingScope.scope),
      prompt: buildBatchPatchPrompt(
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
          host.policyService.throwPolicyBlocked(traceId, `批量 patch 阶段不允许调用工具 ${name}`);
        }

        if (name === 'update_components_props') {
          host.assertBatchToolTargets(traceId, input, pendingScope.scope);
        }

        const toolResult = await host.executeToolWithRetry(
          name,
          input,
          context,
          traceId,
          reporter,
          () => {
            retryCount += 1;
          },
        );
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
        host.policyService.throwTimeout(traceId, metrics);
      }

      host.policyService.throwPolicyBlocked(traceId, error.message, error.details);
    }

    throw error;
  }

  await reporter.emitStatus({
    stage: 'validating_output',
    label: '正在校验和预览批量 patch',
    targetId: resolvedSelectedId,
  });

  const { patch, previewSchema, previewSummary, changeGroups, risk, scopeSummary } =
    await host.finalizePatch(
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
