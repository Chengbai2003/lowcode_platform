import { Injectable } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { ChatRequestDto } from '../ai/dto/chat-request.dto';
import { ContextAssemblerService, FocusContextResult } from '../schema-context';
import {
  buildCompactContextSections,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentProgressReporter, NOOP_AGENT_PROGRESS_REPORTER } from './types/agent-progress.types';
import { AgentRouteDecision } from './types/agent-edit.types';
import { AgentEditAnswerResponse } from './types/agent-edit.types';

@Injectable()
export class AgentAnswerService {
  constructor(
    private readonly aiService: AIService,
    private readonly contextAssembler: ContextAssemblerService,
  ) {}

  async answer(
    dto: AgentEditRequestDto,
    traceId: string,
    options?: {
      routeDecision?: AgentRouteDecision;
      reporter?: AgentProgressReporter;
    },
  ): Promise<AgentEditAnswerResponse> {
    const reporter = options?.reporter ?? NOOP_AGENT_PROGRESS_REPORTER;
    const hasSchemaSource = dto.draftSchema || dto.pageId;

    let contextResult: FocusContextResult | undefined;

    if (hasSchemaSource) {
      await reporter.emitStatus({
        stage: 'assembling_context',
        label: '正在整理页面上下文',
      });

      contextResult =
        options?.routeDecision?.prefetchedFocusContext ??
        (await this.contextAssembler.assemble({
          pageId: dto.pageId,
          version: dto.version,
          draftSchema: dto.draftSchema,
          selectedId: dto.selectedId,
          instruction: dto.instruction,
        }));
    }

    const request: ChatRequestDto = {
      messages: this.buildMessages(dto, contextResult),
      provider: dto.provider,
      modelId: dto.modelId,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    };

    await reporter.emitStatus({
      stage: 'calling_model',
      label: contextResult ? '正在结合页面上下文回答' : '正在生成回答',
    });

    const result = dto.stream
      ? await this.aiService.streamChatText(request, {
          onTextDelta: async (delta) => {
            await reporter.emitContentDelta({
              mode: 'answer',
              delta,
            });
          },
        })
      : await this.aiService.chat(request);

    await reporter.emitStatus({
      stage: 'completed',
      label: '问答完成',
    });

    return {
      mode: 'answer',
      content: result.content,
      warnings: [],
      usage: result.usage,
      traceId,
      route: options?.routeDecision?.route ?? {
        requestedMode: dto.responseMode ?? 'answer',
        resolvedMode: 'answer',
        reason: 'manual_answer',
        manualOverride: (dto.responseMode ?? 'answer') !== 'auto',
      },
    };
  }

  private buildMessages(
    dto: AgentEditRequestDto,
    contextResult?: FocusContextResult,
  ): Array<{ role: string; content: string }> {
    const history = (dto.conversationHistory || [])
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-6)
      .map((message) => ({
        role: message.role,
        content: sanitizePromptText(message.content, MAX_HISTORY_MESSAGE_CHARS),
      }));

    const contextChunks = buildCompactContextSections(contextResult);
    const systemPrompt = contextResult
      ? [
          '你是一个低代码编辑器里的页面理解助手。',
          '你可以解释当前页面结构、组件作用、候选目标和编辑影响。',
          '你不能编造不存在的组件 ID，也不要输出 patch 或完整 schema。',
          '如果上下文不足以确定原因，要明确说明不确定性，并指出你依据的是哪些页面信息。',
          '回答使用自然语言，优先简洁、直接。',
        ].join('\n')
      : ['你是一个低代码编辑器里的通用助手。', '回答要直接、自然，不要输出 patch 或 schema。'].join(
          '\n',
        );

    contextChunks.push(
      `用户问题: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`,
    );

    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: contextChunks.join('\n\n') },
    ];
  }
}
