import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';
import { AgentService } from './agent.service';

@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('edit')
  @HttpCode(HttpStatus.OK)
  async edit(@Body() dto: AgentEditRequestDto) {
    if (!dto.instruction?.trim()) {
      throw new BadRequestException('instruction is required');
    }

    return this.agentService.edit(dto);
  }
}
