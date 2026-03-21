import { Injectable, Logger } from '@nestjs/common';
import { getCoreActionTypes } from '../ai/prompt-builder';
import { AIService, AIToolCallingError } from '../ai/ai.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../agent-tools/tool-registry.service';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { ToolExecutionContext } from '../agent-tools/types/tool.types';
import { ComponentMetaRegistry } from '../schema-context';
import type {
  A2UIComponent,
  A2UISchema,
  FocusContextResult,
  NodeCandidate,
} from '../schema-context';
import { buildAncestorChain, buildParentMap } from '../schema-context/utils/parent-map.builder';
import { buildPatchPresentation } from './agent-preview.utils';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  buildCompactContextSections,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import { AgentPolicyService, AgentRunMetrics } from './agent-policy.service';
import { AgentProgressReporter, NOOP_AGENT_PROGRESS_REPORTER } from './types/agent-progress.types';
import {
  AgentClarificationCandidate,
  AgentEditClarificationResponse,
  AgentEditPatchResponse,
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

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly toolExecutionService: ToolExecutionService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly policyService: AgentPolicyService,
    private readonly componentMetaRegistry: ComponentMetaRegistry,
  ) {}

  async runEdit(
    dto: AgentEditRequestDto,
    requestId?: string,
    options?: {
      routeDecision?: AgentRouteDecision;
      reporter?: AgentProgressReporter;
    },
  ): Promise<AgentEditPatchResponse | AgentEditClarificationResponse> {
    const traceId = this.policyService.createTraceId(requestId);
    const metrics: AgentRunMetrics = { stepCount: 0, toolCallCount: 0 };
    const limits = this.policyService.getLimits();
    const reporter = options?.reporter ?? NOOP_AGENT_PROGRESS_REPORTER;

    this.policyService.assertPatchRequestAllowed(dto, traceId);

    await reporter.emitStatus({
      stage: 'assembling_context',
      label: '正在准备页面上下文',
    });

    const context = await this.toolExecutionService.createExecutionContext(
      {
        pageId: dto.pageId,
        version: dto.version,
        draftSchema: dto.draftSchema,
      },
      traceId,
    );

    this.logger.log(
      `[${traceId}] run start mode=patch pageId=${dto.pageId} version=${dto.version ?? 'n/a'}`,
    );

    await reporter.emitStatus({
      stage: 'resolving_target',
      label: '正在解析编辑目标',
    });

    const targetResolution = await this.resolveTarget(
      dto,
      context,
      traceId,
      options?.routeDecision?.prefetchedFocusContext,
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
    const prompt = this.buildPrompt(dto, focusContextResult, resolvedSelectedId);

    try {
      const agentTools = this.toolRegistry.listDefinitions('agent');

      await reporter.emitStatus({
        stage: 'calling_model',
        label: '正在调用模型规划编辑步骤',
        targetId: resolvedSelectedId,
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
            const toolResult = await this.toolExecutionService.executeTool(name, input, context);
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

      await reporter.emitStatus({
        stage: 'validating_output',
        label: '正在校验和预览 patch',
        targetId: resolvedSelectedId,
      });

      const { patch, previewSchema, previewSummary, changeGroups, risk } = await this.finalizePatch(
        context,
        traceId,
      );

      this.logger.log(
        `[${traceId}] finish reason=${result.finishReason} steps=${metrics.stepCount} toolCalls=${metrics.toolCallCount} patchOps=${patch.length}`,
      );

      await reporter.emitStatus({
        stage: 'completed',
        label: 'Patch 预览完成',
        finishReason: result.finishReason,
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
  ): string {
    const chunks = buildCompactContextSections(focusContextResult);

    if (resolvedSelectedId) {
      chunks.push(`默认编辑目标组件: ${resolvedSelectedId}`);
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

  private async finalizePatch(
    context: ToolExecutionContext,
    traceId: string,
  ): Promise<{
    patch: EditorPatchOperation[];
    previewSchema: ToolExecutionContext['workingSchema'];
    previewSummary: string;
    changeGroups: ReturnType<typeof buildPatchPresentation>['changeGroups'];
    risk: ReturnType<typeof buildPatchPresentation>['risk'];
  }> {
    const rawPatch = context.accumulatedPatch.map((operation) => ({ ...operation }));
    this.policyService.assertPatchProduced(rawPatch, traceId);
    this.policyService.assertPatchWithinLimits(rawPatch, traceId);

    const guardContext = this.createGuardContext(context);
    const baseSchema = guardContext.workingSchema;
    const autoFixResult = await this.toolExecutionService.executeTool(
      'auto_fix_patch',
      { patch: rawPatch },
      guardContext,
    );
    const autoFixedPatch = (
      (autoFixResult.data as { patch?: EditorPatchOperation[] } | undefined)?.patch ?? rawPatch
    ).map((operation) => ({ ...operation }));
    this.logger.log(
      `[${traceId}] auto-fix warnings=${autoFixResult.warnings?.length ?? 0} patchOps=${autoFixedPatch.length}`,
    );

    this.policyService.assertPatchProduced(autoFixedPatch, traceId);
    this.policyService.assertPatchWithinLimits(autoFixedPatch, traceId);

    const previewResult = await this.toolExecutionService.executeTool(
      'preview_patch',
      { patch: autoFixedPatch },
      guardContext,
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

    return {
      patch: previewPatch,
      previewSchema: guardContext.workingSchema,
      previewSummary: previewArtifacts.previewSummary,
      changeGroups: previewArtifacts.changeGroups,
      risk: previewArtifacts.risk,
    };
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
      name === 'bind_event' ||
      name === 'remove_component' ||
      name === 'move_component'
    );
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
