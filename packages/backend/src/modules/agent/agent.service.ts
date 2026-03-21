import { Injectable } from '@nestjs/common';
import { AgentAnswerService } from './agent-answer.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentEditResponse } from './types/agent-edit.types';
import { AgentProgressReporter } from './types/agent-progress.types';

@Injectable()
export class AgentService {
  constructor(
    private readonly answerService: AgentAnswerService,
    private readonly legacySchemaService: AgentLegacySchemaService,
    private readonly runnerService: AgentRunnerService,
    private readonly routingService: AgentRoutingService,
  ) {}

  async edit(
    dto: AgentEditRequestDto,
    requestId?: string,
    reporter?: AgentProgressReporter,
  ): Promise<AgentEditResponse> {
    const traceId = this.routingService.createTraceId(requestId);
    await reporter?.emitMeta(traceId);
    await reporter?.emitStatus({
      stage: 'routing',
      label: '正在判定响应模式',
    });

    const routeDecision = await this.routingService.resolve(
      {
        ...dto,
        responseMode: dto.responseMode ?? 'schema',
      },
      traceId,
    );

    await reporter?.emitRoute(routeDecision.route);

    if (routeDecision.route.resolvedMode === 'answer') {
      return this.answerService.answer(dto, traceId, { routeDecision, reporter });
    }

    if (routeDecision.route.resolvedMode === 'patch') {
      return this.runnerService.runEdit(dto, traceId, { routeDecision, reporter });
    }

    return this.legacySchemaService.edit(dto, traceId, { routeDecision, reporter });
  }
}
