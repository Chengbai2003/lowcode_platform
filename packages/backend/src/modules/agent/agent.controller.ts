import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PatchPreviewRequestDto } from '../agent-tools/dto/patch-preview-request.dto';
import { ToolExecutionService } from '../agent-tools/tool-execution.service';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentService } from './agent.service';

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

  @Post('patch/preview')
  @HttpCode(HttpStatus.OK)
  async previewPatch(
    @Body() dto: PatchPreviewRequestDto,
    @Req() request: Request & { requestId?: string },
  ) {
    const traceId = request.requestId ?? `preview-${Date.now().toString(36)}`;
    return this.toolExecutionService.previewPatch(dto, traceId);
  }
}
