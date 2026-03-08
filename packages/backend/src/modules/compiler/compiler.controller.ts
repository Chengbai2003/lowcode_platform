/**
 * Compiler 控制器
 * 提供代码编译 API
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CompilerService } from './compiler.service';
import { CompileRequestDto } from './dto/compile-request.dto';

@Controller('compiler')
@UseGuards(AuthGuard)
export class CompilerController {
  private readonly logger = new Logger(CompilerController.name);

  constructor(private readonly compilerService: CompilerService) {}

  /**
   * 健康检查端点
   * GET /api/v1/compiler/health
   */
  @Get('health')
  health() {
    return { status: 'ok', service: 'compiler' };
  }

  /**
   * 编译 Schema 为 React 代码
   * POST /api/v1/compiler/export
   */
  @Post('export')
  @HttpCode(HttpStatus.OK)
  async export(@Body() dto: CompileRequestDto) {
    this.logger.log('[export] Compiling schema to React code');

    const result = await this.compilerService.compile(dto);

    return {
      success: true,
      data: {
        code: result.formatted,
        raw: result.code,
      },
    };
  }
}
