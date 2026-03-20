import { Injectable, Logger } from '@nestjs/common';
import { getCoreActionTypes } from '../ai/prompt-builder';
import { AIService, AIToolCallingError } from '../ai/ai.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../agent-tools/tool-registry.service';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { ToolExecutionContext } from '../agent-tools/types/tool.types';
import { FocusContextResult } from '../schema-context';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  formatFocusContext,
  formatPageOverview,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import { AgentPolicyService, AgentRunMetrics } from './agent-policy.service';
import { AgentEditPatchResponse } from './types/agent-edit.types';

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly toolExecutionService: ToolExecutionService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly policyService: AgentPolicyService,
  ) {}

  async runEdit(dto: AgentEditRequestDto, requestId?: string): Promise<AgentEditPatchResponse> {
    const traceId = this.policyService.createTraceId(requestId);
    const metrics: AgentRunMetrics = { stepCount: 0, toolCallCount: 0 };
    const limits = this.policyService.getLimits();

    this.policyService.assertPatchRequestAllowed(dto, traceId);

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

    const { resolvedSelectedId, focusContextResult } = await this.resolveTarget(dto, context);
    const prompt = this.buildPrompt(dto, focusContextResult, resolvedSelectedId);

    try {
      const agentTools = this.toolRegistry.listDefinitions('agent');

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
          const toolResult = await this.toolExecutionService.executeTool(name, input, context);
          this.logger.log(
            `[${traceId}] tool result name=${name} write=${isWriteOperation} patchDelta=${toolResult.patchDelta?.length ?? 0} totalPatch=${context.accumulatedPatch.length}`,
          );
          return toolResult.data ?? { ok: true };
        },
        onStepFinish: (event) => {
          metrics.stepCount = Math.max(metrics.stepCount, event.stepNumber + 1);
          this.logger.log(
            `[${traceId}] step=${event.stepNumber} finishReason=${event.finishReason} toolCalls=${event.toolCalls.length}`,
          );
        },
        onToolCallStart: (event) => {
          metrics.toolCallCount += 1;
        },
        onToolCallFinish: (event) => {
          this.logger.log(
            `[${traceId}] tool finish step=${event.stepNumber ?? 0} name=${event.toolCall.toolName} success=${event.success} totalPatch=${context.accumulatedPatch.length}`,
          );
        },
      });

      metrics.stepCount = Math.max(metrics.stepCount, result.steps.length);
      metrics.toolCallCount = Math.max(metrics.toolCallCount, result.toolCallCount);

      const patch = await this.finalizePatch(context, traceId);

      this.logger.log(
        `[${traceId}] finish reason=${result.finishReason} steps=${metrics.stepCount} toolCalls=${metrics.toolCallCount} patchOps=${patch.length}`,
      );

      return {
        mode: 'patch',
        pageId: context.pageId,
        baseVersion: dto.version,
        resolvedVersion: context.resolvedVersion,
        resolvedSelectedId,
        patch,
        warnings: [...context.warnings],
        traceId,
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
  ): Promise<{ resolvedSelectedId?: string; focusContextResult: FocusContextResult }> {
    const initialResult = await this.toolExecutionService.getFocusContext(
      context,
      dto.selectedId,
      dto.instruction,
    );

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

    throw new AgentToolException({
      code: 'NODE_AMBIGUOUS',
      message: 'Instruction matches multiple possible components',
      traceId: context.traceId,
      details: {
        candidates: candidates.slice(0, 3).map((candidate) => ({
          id: candidate.id,
          type: candidate.type,
          score: candidate.score,
          reason: candidate.reason,
        })),
      },
    });
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
      '如果你已经完成修改，就停止继续调用工具。',
    ].join('\n');
  }

  private buildPrompt(
    dto: AgentEditRequestDto,
    focusContextResult: FocusContextResult,
    resolvedSelectedId?: string,
  ): string {
    const chunks = [formatPageOverview(focusContextResult)];
    if (focusContextResult.mode === 'focused' && focusContextResult.context) {
      chunks.push(formatFocusContext(focusContextResult.context));
    }

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
  ): Promise<EditorPatchOperation[]> {
    const rawPatch = context.accumulatedPatch.map((operation) => ({ ...operation }));
    this.policyService.assertPatchProduced(rawPatch, traceId);
    this.policyService.assertPatchWithinLimits(rawPatch, traceId);

    const guardContext = this.createGuardContext(context);
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
    return previewPatch;
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
}
