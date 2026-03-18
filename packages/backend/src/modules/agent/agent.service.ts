import { BadRequestException, Injectable } from '@nestjs/common';
import { buildSystemPrompt } from '../ai/prompt-builder';
import { AIService } from '../ai/ai.service';
import { ChatRequestDto } from '../ai/dto/chat-request.dto';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';

export interface AgentEditResponse {
  mode: 'schema';
  content: string;
  schema?: Record<string, unknown>;
  warnings: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  pageId?: string;
  version?: number;
  selectedId?: string;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly aiService: AIService,
    private readonly pageSchemaService: PageSchemaService,
  ) {}

  async edit(dto: AgentEditRequestDto): Promise<AgentEditResponse> {
    const resolvedSchema = await this.resolveSchema(dto);
    const messages = this.buildMessages(dto, resolvedSchema);

    const result = await this.aiService.chat({
      messages,
      provider: dto.provider,
      modelId: dto.modelId,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    } as ChatRequestDto);

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
    };
  }

  private async resolveSchema(
    dto: AgentEditRequestDto,
  ): Promise<Record<string, unknown> | undefined> {
    if (dto.draftSchema) {
      return dto.draftSchema;
    }

    if (!dto.pageId) {
      return undefined;
    }

    const page = await this.pageSchemaService.getSchema(dto.pageId, dto.version);
    return page.schema;
  }

  private buildMessages(
    dto: AgentEditRequestDto,
    resolvedSchema?: Record<string, unknown>,
  ): Array<{ role: string; content: string }> {
    const systemPrompt = `${buildSystemPrompt()}

如果提供了当前页面 Schema，请在其基础上修改，并返回修改后的完整 A2UI Schema JSON。
当前阶段不要返回 patch，不要返回 markdown，不要附加解释文字。`;

    const history = (dto.conversationHistory || []).slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const contextChunks = [
      resolvedSchema
        ? `当前页面 Schema:\n${JSON.stringify(resolvedSchema, null, 2)}`
        : '当前没有现成页面 Schema，请根据用户指令生成完整页面 Schema。',
      dto.selectedId ? `当前选中组件 ID: ${dto.selectedId}` : '',
      `用户指令: ${dto.instruction}`,
    ].filter(Boolean);

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
