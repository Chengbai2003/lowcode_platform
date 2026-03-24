import { Injectable } from '@nestjs/common';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentEditResponse } from './types/agent-edit.types';
import { MAX_HISTORY_MESSAGE_CHARS, sanitizePromptText } from './agent-prompt.utils';

type ConversationRole = 'user' | 'assistant';

interface AgentSessionTurn {
  role: ConversationRole;
  content: string;
}

interface AgentSessionMemoryState {
  recentTurns: AgentSessionTurn[];
  summary?: string;
  updatedAt: number;
}

export interface AgentConversationContext {
  recentHistory: AgentSessionTurn[];
  summary?: string;
}

const MAX_RECENT_TURNS = 8;
const MAX_SUMMARY_CHARS = 1200;
const MAX_SUMMARY_ENTRY_CHARS = 120;

function normalizeTurns(
  turns?: Array<{
    role?: string;
    content?: string;
  }>,
): AgentSessionTurn[] {
  return (turns ?? [])
    .filter(
      (turn): turn is { role: ConversationRole; content: string } =>
        (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string',
    )
    .map((turn) => ({
      role: turn.role,
      content: sanitizePromptText(turn.content, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((turn) => turn.content.length > 0);
}

function summarizeTurns(turns: readonly AgentSessionTurn[]): string {
  return turns
    .map(
      (turn) =>
        `- ${turn.role}: ${sanitizePromptText(turn.content, MAX_SUMMARY_ENTRY_CHARS).replace(/\s+/g, ' ')}`,
    )
    .join('\n');
}

function mergeSummary(
  existing: string | undefined,
  turns: readonly AgentSessionTurn[],
): string | undefined {
  const fragments = [existing?.trim(), summarizeTurns(turns).trim()].filter(Boolean);
  if (fragments.length === 0) {
    return undefined;
  }

  return sanitizePromptText(fragments.join('\n'), MAX_SUMMARY_CHARS);
}

function buildAssistantMemoryContent(response: AgentEditResponse): string {
  switch (response.mode) {
    case 'answer':
      return response.content;
    case 'schema':
      return response.schema
        ? `Schema 生成完成。${response.content.slice(0, 240)}`
        : response.content.slice(0, 240);
    case 'clarification':
      return response.content;
    case 'intent_confirmation':
      return response.content;
    case 'scope_confirmation':
      return response.content;
    case 'patch':
      return response.previewSummary;
  }
}

@Injectable()
export class AgentSessionMemoryService {
  private readonly sessions = new Map<string, AgentSessionMemoryState>();

  prepare(dto: AgentEditRequestDto): AgentConversationContext {
    const incoming = normalizeTurns(dto.conversationHistory);
    const sessionId = dto.sessionId?.trim();

    if (!sessionId) {
      return {
        recentHistory: incoming.slice(-MAX_RECENT_TURNS),
      };
    }

    const state = this.sessions.get(sessionId);
    return {
      recentHistory: (incoming.length > 0 ? incoming : (state?.recentTurns ?? [])).slice(
        -MAX_RECENT_TURNS,
      ),
      summary: state?.summary,
    };
  }

  remember(dto: AgentEditRequestDto, response: AgentEditResponse) {
    const sessionId = dto.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    const requestTurns = normalizeTurns(dto.conversationHistory);
    const assistantTurn: AgentSessionTurn = {
      role: 'assistant',
      content: sanitizePromptText(buildAssistantMemoryContent(response), MAX_HISTORY_MESSAGE_CHARS),
    };
    const combined = [...requestTurns, assistantTurn];
    const overflow = combined.length > MAX_RECENT_TURNS ? combined.slice(0, -MAX_RECENT_TURNS) : [];
    const recentTurns =
      combined.length > MAX_RECENT_TURNS ? combined.slice(-MAX_RECENT_TURNS) : combined;
    const previous = this.sessions.get(sessionId);

    this.sessions.set(sessionId, {
      recentTurns,
      summary: mergeSummary(previous?.summary, overflow),
      updatedAt: Date.now(),
    });
  }
}
