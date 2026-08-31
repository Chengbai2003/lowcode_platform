/**
 * Compiler 服务
 * 处理 Schema 编译相关业务逻辑
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { validatePageSchemaValue } from '@lowcode-platform/schema-contract';
import { CompileRequestDto } from './dto/compile-request.dto';
import { compileToCode, formatCode } from './generator';
import { resolveTrustedCompilerBindings } from './preset/trustedCompilerPresetResolver';
import { PageSchemaService } from '../page-schema/page-schema.service';

@Injectable()
export class CompilerService {
  private readonly logger = new Logger(CompilerService.name);

  constructor(private readonly pageSchemaService: PageSchemaService) {}

  /**
   * 编译 Schema 为 React 代码
   */
  async compile(dto: CompileRequestDto): Promise<{ code: string; formatted: string }> {
    this.logger.log('[compile] Starting compilation');

    if (!dto || typeof dto !== 'object' || !dto.schema) {
      throw new BadRequestException('Missing required schema object');
    }

    // 1. Contract 边界校验：严格校验输入的 Schema 是否符合规范（fail-close）
    const validationResult = validatePageSchemaValue(dto.schema);
    if (!validationResult.ok) {
      const firstError = validationResult.issues[0]?.message || 'Invalid A2UI Page Schema';
      this.logger.warn(`[compile] Schema validation failed: ${firstError}`);
      throw new BadRequestException({
        message: firstError,
        issues: validationResult.issues,
      });
    }

    const canonicalSchema = validationResult.value;

    // 2. 页面快照是运行时兼容信息的唯一可信来源；客户端不得指定 Preset 或导入路径。
    const page = await this.pageSchemaService.getSchema(
      dto.options.pageId,
      dto.options.pageVersion,
    );
    const trustedBindings = resolveTrustedCompilerBindings(
      page.runtimeCompatibility.componentPresetId,
    );

    try {
      // 3. 执行代码生成流水线
      const code = compileToCode(canonicalSchema, trustedBindings);

      // 4. 格式化代码
      const formatted = await formatCode(code);

      this.logger.log('[compile] Compilation successful');

      return { code, formatted };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`[compile] Compilation failed: ${err.message}`, err.stack);
      throw new BadRequestException(`Compilation failed: ${err.message}`);
    }
  }
}
