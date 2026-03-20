import { BadRequestException, Injectable } from '@nestjs/common';
import { buildSystemPrompt } from '../ai/prompt-builder';
import { AIService } from '../ai/ai.service';
import { ChatRequestDto } from '../ai/dto/chat-request.dto';
import { ContextAssemblerService, FocusContext, FocusContextResult } from '../schema-context';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';

const MAX_INSTRUCTION_PROMPT_CHARS = 2000;
const MAX_HISTORY_MESSAGE_CHARS = 4000;
const MAX_SUBTREE_PROMPT_CHARS = 2500;
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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
    private readonly contextAssembler: ContextAssemblerService,
  ) {}

  async edit(dto: AgentEditRequestDto): Promise<AgentEditResponse> {
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
        content: this.sanitizePromptText(message.content, MAX_HISTORY_MESSAGE_CHARS),
      }));

    const contextChunks: string[] = [];

    if (contextResult) {
      contextChunks.push(this.formatPageOverview(contextResult));

      if (contextResult.mode === 'focused' && contextResult.context) {
        contextChunks.push(this.formatFocusContext(contextResult.context));
      } else if (contextResult.mode === 'candidates' && contextResult.candidates?.length) {
        contextChunks.push(this.formatCandidates(contextResult.candidates));
      }
    } else {
      contextChunks.push('当前没有现成页面 Schema，请根据用户指令生成完整页面 Schema。');
    }

    contextChunks.push(
      `用户指令: ${this.sanitizePromptText(dto.instruction, MAX_INSTRUCTION_PROMPT_CHARS)}`,
    );

    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: contextChunks.join('\n\n') },
    ];
  }

  private formatPageOverview(contextResult: FocusContextResult): string {
    const { schema } = contextResult;
    const rootNode = schema.components[schema.rootId];
    const totalComponents =
      contextResult.mode === 'focused' && contextResult.context
        ? contextResult.context.schemaStats.totalComponents
        : Object.keys(schema.components).length;

    const rootChildren = (rootNode?.childrenIds ?? [])
      .slice(0, 8)
      .map((id) => `${id}(${schema.components[id]?.type ?? 'unknown'})`);

    const lines = ['## 页面概览'];
    lines.push(`- rootId: ${schema.rootId}`);

    if (schema.version !== undefined) {
      lines.push(`- version: ${schema.version}`);
    }

    lines.push(`- 总组件数: ${totalComponents}`);

    if (rootChildren.length > 0) {
      const totalRootChildren = rootNode?.childrenIds?.length ?? 0;
      const suffix = totalRootChildren > rootChildren.length ? ` 等 ${totalRootChildren} 个` : '';
      lines.push(`- 根节点子组件: ${rootChildren.join(', ')}${suffix}`);
    }

    return lines.join('\n');
  }

  private formatFocusContext(ctx: FocusContext): string {
    const lines: string[] = ['## 当前焦点组件'];
    lines.push(`- ID: ${ctx.focusNode.id}`);
    lines.push(`- 类型: ${ctx.focusNode.type}`);

    if (ctx.focusNode.props && Object.keys(ctx.focusNode.props).length > 0) {
      lines.push(`- 属性: ${JSON.stringify(ctx.focusNode.props)}`);
    }

    if (ctx.parent) {
      lines.push(`- 父组件: ${ctx.parent.id} (${ctx.parent.type})`);
    }

    if (ctx.ancestors.length > 0) {
      const chain = ctx.ancestors.map((a) => `${a.id}(${a.type})`).join(' → ');
      lines.push(`- 祖先链: ${chain}`);
    }

    if (ctx.siblings.length > 0) {
      const sibs = ctx.siblings.map((s) => `${s.id}(${s.type})`).join(', ');
      lines.push(`- 兄弟组件: ${sibs}`);
    }

    if (ctx.children.length > 0) {
      const kids = ctx.children.map((c) => `${c.id}(${c.type})`).join(', ');
      lines.push(`- 子组件: ${kids}`);
    } else {
      lines.push('- 子组件: 无');
    }

    if (Object.keys(ctx.subtree).length > 0) {
      lines.push('');
      lines.push('### 焦点子树:');
      lines.push(this.formatJsonBlock(ctx.subtree, MAX_SUBTREE_PROMPT_CHARS));
    }

    return lines.join('\n');
  }

  private formatCandidates(
    candidates: readonly { id: string; type: string; score: number; reason: string }[],
  ): string {
    const lines: string[] = ['## 可能的目标组件候选'];
    for (const c of candidates) {
      lines.push(`- ${c.id} (${c.type}) [score=${c.score}]: ${c.reason}`);
    }
    return lines.join('\n');
  }

  private sanitizePromptText(input: string, maxChars: number): string {
    const normalized = input.replace(CONTROL_CHARS_REGEX, ' ').trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars)}...(truncated)`;
  }

  private formatJsonBlock(value: unknown, maxChars: number): string {
    const json = JSON.stringify(value, null, 2);
    if (json.length <= maxChars) {
      return json;
    }

    const remainingChars = json.length - maxChars;
    return `${json.slice(0, maxChars)}\n... [truncated ${remainingChars} chars]`;
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
