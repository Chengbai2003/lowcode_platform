import { Injectable } from '@nestjs/common';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentEditPatchResponse } from './types/agent-edit.types';

interface AgentIdempotencyEntry {
  requestFingerprint: string;
  response: AgentEditPatchResponse;
  createdAt: number;
}

const IDEMPOTENCY_TTL_MS = 5 * 60_000;

@Injectable()
export class AgentIdempotencyService {
  private readonly entries = new Map<string, AgentIdempotencyEntry>();

  get(dto: AgentEditRequestDto): AgentEditPatchResponse | undefined {
    const key = dto.requestIdempotencyKey?.trim();
    if (!key) {
      return undefined;
    }

    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.createdAt > IDEMPOTENCY_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }

    if (entry.requestFingerprint !== this.buildFingerprint(dto)) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.response;
  }

  set(dto: AgentEditRequestDto, response: AgentEditPatchResponse) {
    const key = dto.requestIdempotencyKey?.trim();
    if (!key) {
      return;
    }

    this.entries.set(key, {
      requestFingerprint: this.buildFingerprint(dto),
      response,
      createdAt: Date.now(),
    });
  }

  private buildFingerprint(dto: AgentEditRequestDto): string {
    return JSON.stringify({
      instruction: dto.instruction.trim(),
      pageId: dto.pageId?.trim(),
      version: dto.version,
      selectedId: dto.selectedId?.trim(),
      responseMode: dto.responseMode ?? 'schema',
      sessionId: dto.sessionId?.trim(),
    });
  }
}
