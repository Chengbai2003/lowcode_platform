import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { MAX_INSTRUCTION_PROMPT_CHARS, sanitizePromptText } from './agent-prompt.utils';
import { AgentIntentClassification, ResolvedAgentMode } from './types/agent-edit.types';

const INTENT_CLASSIFIER_MAX_TOKENS = 200;
const INTENT_CLASSIFIER_TEMPERATURE = 0;
const MAX_REASON_CHARS = 120;

@Injectable()
export class AgentIntentClassifierService {
  private readonly logger = new Logger(AgentIntentClassifierService.name);

  constructor(private readonly aiService: AIService) {}

  async classify(
    dto: AgentEditRequestDto,
    traceId: string,
  ): Promise<AgentIntentClassification | undefined> {
    const instruction = sanitizePromptText(dto.instruction ?? '', MAX_INSTRUCTION_PROMPT_CHARS);
    if (!instruction) {
      return undefined;
    }

    try {
      const result = await this.aiService.chat({
        messages: [
          {
            role: 'system',
            content: [
              '你是低代码编辑器的响应模式分类器。',
              '请只根据用户最后一条指令和轻量编辑器信号，判断请求应该走 answer、schema 还是 patch。',
              '输出必须是 JSON，不能输出 markdown、解释、代码块或额外文本。',
              '分类规则：',
              '- answer: 用户在提问、解释页面、理解组件、询问原因或能力介绍，不应进入写工具链。',
              '- schema: 用户要生成整页、新建页面、重做整页，或当前更适合返回完整 schema。',
              '- patch: 用户要修改当前页面里的局部组件、属性、事件、结构，应走局部 patch。',
              '- 如果用户明显在问答解释，优先 answer，不要误判为 patch。',
              '- 如果用户明显在改当前页面，优先 patch，不要误判为 schema。',
              '- “生成一个登录页 / 新建一个列表页”更偏 schema。',
              '- “把这个按钮改成提交 / 给表格加标题 / 绑定点击事件 / 隐藏输入框”更偏 patch。',
              '- “这个页面是做什么的 / 为什么这个按钮禁用 / 你是谁 / 怎么用”更偏 answer。',
              '返回 JSON 字段：',
              '- mode: "answer" | "schema" | "patch"',
              '- confidence: 0 到 1 的数字',
              '- reason: 不超过 20 个字的简短中文原因',
              '- needsPageContext: boolean',
              '- needsTargetResolution: boolean',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                instruction,
                signals: {
                  hasPageContext: Boolean(dto.pageId?.trim() && dto.version !== undefined),
                  hasSelectedId: Boolean(dto.selectedId?.trim()),
                  hasDraftSchema: Boolean(dto.draftSchema),
                },
              },
              null,
              2,
            ),
          },
        ],
        provider: dto.provider,
        modelId: dto.modelId,
        temperature: INTENT_CLASSIFIER_TEMPERATURE,
        maxTokens: INTENT_CLASSIFIER_MAX_TOKENS,
      });

      const classification = this.parseClassification(result.content);
      if (!classification) {
        this.logger.warn(
          `[${traceId}] llm intent classification returned invalid payload: ${result.content.slice(0, 200)}`,
        );
        return undefined;
      }

      this.logger.log(
        `[${traceId}] llm intent mode=${classification.mode} confidence=${classification.confidence.toFixed(2)} reason=${classification.reason}`,
      );

      return classification;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[${traceId}] llm intent classification failed: ${message}`);
      return undefined;
    }
  }

  private parseClassification(content: string): AgentIntentClassification | undefined {
    const jsonBlock = this.extractJsonObject(content);
    if (!jsonBlock) {
      return undefined;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonBlock) as Record<string, unknown>;
    } catch {
      return undefined;
    }

    if (!this.isResolvedAgentMode(parsed.mode)) {
      return undefined;
    }

    const rawConfidence = Number(parsed.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0.5;

    return {
      mode: parsed.mode,
      confidence,
      reason: sanitizePromptText(String(parsed.reason ?? parsed.mode), MAX_REASON_CHARS),
      needsPageContext: parsed.mode === 'patch' ? true : Boolean(parsed.needsPageContext),
      needsTargetResolution:
        parsed.mode === 'patch' ? Boolean(parsed.needsTargetResolution) : false,
    };
  }

  private extractJsonObject(content: string): string | undefined {
    const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const normalized = (fencedMatch?.[1] ?? content).trim();
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return undefined;
    }

    return normalized.slice(start, end + 1);
  }

  private isResolvedAgentMode(value: unknown): value is ResolvedAgentMode {
    return value === 'answer' || value === 'schema' || value === 'patch';
  }
}
