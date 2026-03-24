import { Injectable } from '@nestjs/common';

const INTENT_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export interface PendingIntentOption {
  intentId: string;
  semanticKey: string;
  targetType: string;
  label: string;
  description: string;
}

interface PendingIntentConfirmation {
  intentConfirmationId: string;
  sessionId: string;
  instruction: string;
  pageId?: string;
  rootId: string;
  options: PendingIntentOption[];
  createdAt: number;
  expiresAt: number;
}

@Injectable()
export class AgentIntentConfirmationService {
  private readonly pendingIntents = new Map<string, Map<string, PendingIntentConfirmation>>();

  create(input: {
    sessionId: string;
    instruction: string;
    pageId?: string;
    rootId: string;
    options: Array<Omit<PendingIntentOption, 'intentId'>>;
    traceId: string;
  }) {
    const createdAt = Date.now();
    const intentConfirmationId = `${input.traceId}-intent-${createdAt.toString(36)}`;
    const pending: PendingIntentConfirmation = {
      intentConfirmationId,
      sessionId: input.sessionId,
      instruction: input.instruction.trim(),
      pageId: input.pageId,
      rootId: input.rootId,
      options: input.options.map((option, index) => ({
        ...option,
        intentId: `${intentConfirmationId}-option-${index + 1}`,
      })),
      createdAt,
      expiresAt: createdAt + INTENT_CONFIRMATION_TTL_MS,
    };

    const sessionPendingIntents = this.getSessionPendingIntents(input.sessionId);
    sessionPendingIntents.set(pending.intentConfirmationId, pending);
    return pending;
  }

  getConfirmedOption(sessionId: string, confirmedIntentId: string) {
    const sessionPendingIntents = this.pendingIntents.get(sessionId);
    if (!sessionPendingIntents) {
      return undefined;
    }

    this.pruneExpiredSessionPendingIntents(sessionId, sessionPendingIntents);

    for (const pending of sessionPendingIntents.values()) {
      const option = pending.options.find((item) => item.intentId === confirmedIntentId);
      if (!option) {
        continue;
      }

      return {
        pending,
        option,
      };
    }

    return undefined;
  }

  clear(sessionId: string, intentConfirmationId?: string) {
    const sessionPendingIntents = this.pendingIntents.get(sessionId);
    if (!sessionPendingIntents) {
      return;
    }

    if (!intentConfirmationId) {
      this.pendingIntents.delete(sessionId);
      return;
    }

    sessionPendingIntents.delete(intentConfirmationId);
    if (sessionPendingIntents.size === 0) {
      this.pendingIntents.delete(sessionId);
    }
  }

  private getSessionPendingIntents(sessionId: string) {
    const pending = this.pendingIntents.get(sessionId);
    if (pending) {
      this.pruneExpiredSessionPendingIntents(sessionId, pending);
      const activePending = this.pendingIntents.get(sessionId);
      if (activePending) {
        return activePending;
      }
    }

    const created = new Map<string, PendingIntentConfirmation>();
    this.pendingIntents.set(sessionId, created);
    return created;
  }

  private pruneExpiredSessionPendingIntents(
    sessionId: string,
    sessionPendingIntents: Map<string, PendingIntentConfirmation>,
  ) {
    const now = Date.now();
    for (const [intentConfirmationId, pending] of sessionPendingIntents.entries()) {
      if (pending.expiresAt <= now) {
        sessionPendingIntents.delete(intentConfirmationId);
      }
    }

    if (sessionPendingIntents.size === 0) {
      this.pendingIntents.delete(sessionId);
    }
  }
}
