import { Injectable } from '@nestjs/common';
import { buildSystemPrompt } from '../ai/prompt-builder';
import { AIService } from '../ai/ai.service';
import { ChatRequestDto } from '../ai/dto/chat-request.dto';
import { ContextAssemblerService, FocusContextResult } from '../schema-context';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import {
  formatCandidates,
  formatFocusContext,
  formatPageOverview,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_INSTRUCTION_PROMPT_CHARS,
  sanitizePromptText,
} from './agent-prompt.utils';
import { AgentEditSchemaResponse } from './types/agent-edit.types';

@Injectable()
export class AgentLegacySchemaService {
  constructor(
    private readonly aiService: AIService,
    private readonly contextAssembler: ContextAssemblerService,
  ) {}

  async edit(dto: AgentEditRequestDto, traceId: string): Promise<AgentEditSchemaResponse> {
    const hasSchemaSource = dto.draftSchema || dto.pageId;

    let contextResult: FocusContextResult | undefined;
    if (hasSchemaSource) {
      contextResult = await this.contextAssembler.assemble({
        pageId: dto.pageId,
        version: dto.version,
        draftSchema: dto.draftSchema,
        selectedId: dto.selectedId,
        instruction: dto.instruction,
      });
    }

    const messages = this.buildMessages(dto, contextResult);
    const request: ChatRequestDto = {
      messages,
      provider: dto.provider,
      modelId: dto.modelId,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    };

    const result = await this.aiService.chat(request);
    const parsedSchema = this.tryParseSchema(result.content);
    const warnings =
      parsedSchema === undefined
        ? ['Model output did not contain a parseable A2UI schema JSON']
        : [];

    return {
      mode: 'schema',
      content: result.content,
      schema: parsedSchema,
      warnings,
      usage: result.usage,
      pageId: dto.pageId,
      version: dto.version,
      selectedId: dto.selectedId,
      traceId,
    };
  }

  private buildMessages(
    dto: AgentEditRequestDto,
    contextResult?: FocusContextResult,
  ): Array<{ role: string; content: string }> {
    const componentList = contextResult?.componentList ? [...contextResult.componentList] : [];
    const systemPrompt = `${buildSystemPrompt({ componentList })}

如果提供了页面概览、焦点上下文或候选节点，请严格基于这些结构理解用户意图。
优先修改焦点组件及其直接相关结构，尽量保持未提及区域不变，并返回修改后的完整 A2UI Schema JSON。
当前阶段不要返回 patch，不要返回 markdown，不要附加解释文字。`;

    const history = (dto.conversationHistory || [])
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-6)
      .map((message) => ({
        role: message.role,
        content: sanitizePromptText(message.content, MAX_HISTORY_MESSAGE_CHARS),
      }));

    const contextChunks: string[] = [];
    if (contextResult) {
      contextChunks.push(formatPageOverview(contextResult));
      if (contextResult.mode === 'focused' && contextResult.context) {
        contextChunks.push(formatFocusContext(contextResult.context));
      } else if (contextResult.mode === 'candidates' && contextResult.candidates?.length) {
        contextChunks.push(formatCandidates(contextResult.candidates));
      }
    } else {
      contextChunks.push('当前没有现成页面 Schema，请根据用户指令生成完整页面 Schema。');
    }

    contextChunks.push(
      `用户指令: ${sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`,
    );

    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: contextChunks.join('\n\n') },
    ];
  }

  private tryParseSchema(content: string): Record<string, unknown> | undefined {
    const candidates = this.extractJsonCandidates(content);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && 'rootId' in parsed && 'components' in parsed) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private extractJsonCandidates(content: string): string[] {
    const candidates: string[] = [];
    const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);

    if (fencedMatch?.[1]) {
      candidates.push(fencedMatch[1]);
    }

    const balancedObject = this.findFirstBalancedJsonObject(content);
    if (balancedObject) {
      candidates.push(balancedObject);
    }

    return candidates;
  }

  private findFirstBalancedJsonObject(content: string): string | undefined {
    let startIndex = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          startIndex = index;
        }
        depth += 1;
      } else if (char === '}') {
        if (depth === 0) {
          continue;
        }

        depth -= 1;
        if (depth === 0 && startIndex >= 0) {
          return content.slice(startIndex, index + 1);
        }
      }
    }

    return undefined;
  }
}
