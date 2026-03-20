import { Injectable } from '@nestjs/common';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentEditResponse } from './types/agent-edit.types';

@Injectable()
export class AgentService {
  constructor(
    private readonly legacySchemaService: AgentLegacySchemaService,
    private readonly runnerService: AgentRunnerService,
  ) {}

  async edit(dto: AgentEditRequestDto, requestId?: string): Promise<AgentEditResponse> {
    const responseMode = dto.responseMode ?? 'schema';

    if (responseMode === 'patch') {
      return this.runnerService.runEdit(dto, requestId);
    }

    const traceId = requestId?.trim() ? requestId : `agent-${Date.now().toString(36)}`;
    return this.legacySchemaService.edit(dto, traceId);
  }
}
