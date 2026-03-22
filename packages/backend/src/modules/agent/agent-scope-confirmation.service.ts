import { Injectable } from '@nestjs/common';
import { AgentCollectionScope } from './types/agent-edit.types';

const SCOPE_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

interface PendingScopeConfirmation {
  scopeConfirmationId: string;
  sessionId: string;
  instruction: string;
  pageId?: string;
  rootId: string;
  scope: AgentCollectionScope;
  createdAt: number;
  expiresAt: number;
}

@Injectable()
export class AgentScopeConfirmationService {
  private readonly pendingScopes = new Map<string, PendingScopeConfirmation>();

  create(input: {
    sessionId: string;
    instruction: string;
    pageId?: string;
    rootId: string;
    scope: AgentCollectionScope;
    traceId: string;
  }): PendingScopeConfirmation {
    const createdAt = Date.now();
    const pending: PendingScopeConfirmation = {
      scopeConfirmationId: `${input.traceId}-scope-${createdAt.toString(36)}`,
      sessionId: input.sessionId,
      instruction: input.instruction.trim(),
      pageId: input.pageId,
      rootId: input.rootId,
      scope: input.scope,
      createdAt,
      expiresAt: createdAt + SCOPE_CONFIRMATION_TTL_MS,
    };

    this.pendingScopes.set(input.sessionId, pending);
    return pending;
  }

  get(sessionId: string, scopeConfirmationId: string): PendingScopeConfirmation | undefined {
    const pending = this.pendingScopes.get(sessionId);
    if (!pending) {
      return undefined;
    }

    if (pending.scopeConfirmationId !== scopeConfirmationId) {
      return undefined;
    }

    if (pending.expiresAt <= Date.now()) {
      this.pendingScopes.delete(sessionId);
      return undefined;
    }

    return pending;
  }

  clear(sessionId: string) {
    this.pendingScopes.delete(sessionId);
  }
}
