/**
 * Compiler 服务
 * 处理 Schema 编译相关业务逻辑
 */

import { Injectable, Logger } from '@nestjs/common';
import { CompileRequestDto } from './dto/compile-request.dto';
import { compileToCode, formatCode } from './generator';

@Injectable()
export class CompilerService {
  private readonly logger = new Logger(CompilerService.name);

  /**
   * 编译 Schema 为 React 代码
   */
  async compile(dto: CompileRequestDto): Promise<{ code: string; formatted: string }> {
    this.logger.log('[compile] Starting compilation');

    try {
      // 编译代码
      const code = compileToCode(dto.schema, dto.options);

      // 格式化代码
      const formatted = await formatCode(code);

      this.logger.log('[compile] Compilation successful');

      return { code, formatted };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`[compile] Compilation failed: ${err.message}`, err.stack);
      throw err;
    }
  }
}
