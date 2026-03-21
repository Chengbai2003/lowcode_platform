import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PatchPreviewRequestDto } from '../agent-tools/dto/patch-preview-request.dto';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentService } from './agent.service';
import { AgentErrorEventPayload, AgentProgressReporter } from './types/agent-progress.types';

@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly toolExecutionService: ToolExecutionService,
  ) {}

  @Post('edit')
  @HttpCode(HttpStatus.OK)
  async edit(@Body() dto: AgentEditRequestDto, @Req() request: Request & { requestId?: string }) {
    if (!dto.instruction?.trim()) {
      throw new BadRequestException('instruction is required');
    }

    return this.agentService.edit(dto, request.requestId);
  }

  @Post('edit/stream')
  @HttpCode(HttpStatus.OK)
  async editStream(
    @Body() dto: AgentEditRequestDto,
    @Req() request: Request & { requestId?: string },
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const reporter = this.createSseReporter(response);
    const traceId = request.requestId
      ? request.requestId.startsWith('agent-')
        ? request.requestId
        : `agent-${request.requestId}`
      : `agent-${Date.now().toString(36)}`;

    try {
      if (!dto.instruction?.trim()) {
        throw new BadRequestException('instruction is required');
      }

      const result = await this.agentService.edit(
        {
          ...dto,
          stream: true,
        },
        request.requestId,
        reporter,
      );
      await reporter.emitResult(result);
      await reporter.emitDone(true);
    } catch (error) {
      await reporter.emitError(this.toErrorEvent(error, traceId));
      await reporter.emitDone(false);
    } finally {
      response.end();
    }
  }

  @Post('patch/preview')
  @HttpCode(HttpStatus.OK)
  async previewPatch(
    @Body() dto: PatchPreviewRequestDto,
    @Req() request: Request & { requestId?: string },
  ) {
    const traceId = request.requestId ?? `preview-${Date.now().toString(36)}`;
    return this.toolExecutionService.previewPatch(dto, traceId);
  }

  private createSseReporter(response: Response): AgentProgressReporter {
    const writeEvent = async (event: string, payload: unknown) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    return {
      emitMeta: (traceId) => writeEvent('meta', { type: 'meta', traceId }),
      emitRoute: (route) => writeEvent('route', { type: 'route', route }),
      emitStatus: (event) => writeEvent('status', { type: 'status', ...event }),
      emitContentDelta: (event) => writeEvent('content_delta', { type: 'content_delta', ...event }),
      emitResult: (result) => writeEvent('result', { type: 'result', result }),
      emitError: (error) => writeEvent('error', { type: 'error', error }),
      emitDone: (success) => writeEvent('done', { type: 'done', success }),
    };
  }

  private toErrorEvent(error: unknown, fallbackTraceId: string): AgentErrorEventPayload {
    if (error instanceof AgentToolException) {
      const response = error.getResponse() as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        traceId?: string;
      };

      return {
        code: response.code,
        message: response.message ?? 'Agent request failed',
        details: response.details,
        traceId: response.traceId ?? fallbackTraceId,
      };
    }

    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return {
          message: response,
          traceId: fallbackTraceId,
        };
      }

      const payload = response as { message?: string | string[] };
      return {
        message: Array.isArray(payload.message)
          ? payload.message.join('; ')
          : (payload.message ?? error.message),
        traceId: fallbackTraceId,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        traceId: fallbackTraceId,
      };
    }

    return {
      message: 'Unknown agent stream error',
      traceId: fallbackTraceId,
    };
  }
}
