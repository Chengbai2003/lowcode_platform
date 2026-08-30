import { BadRequestException } from '@nestjs/common';
import {
  requireSupportedPageSchema,
  SchemaValidationError,
  UnsupportedSchemaVersionError,
} from '@lowcode-platform/schema-contract';
import type { PageSchema } from '@lowcode-platform/schema-contract';

/**
 * Contract 的 HTTP 薄适配器：校验输入并返回 canonical、深冻结的 PageSchema。
 *
 * 消费方必须只使用返回值（canonical），不得继续使用原始输入对象；
 * 这样存储层保存的永远是经过完整校验的纯数据对象，
 * 且校验完成后的 TOCTOU 变异不会影响保存内容。
 *
 * Contract 校验失败统一映射为 400 BadRequestException。
 */
export function requireValidPageSchema(input: unknown): PageSchema {
  try {
    return requireSupportedPageSchema(input);
  } catch (error) {
    if (error instanceof UnsupportedSchemaVersionError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof SchemaValidationError) {
      const detail = error.issues
        .map((issue) => `[${issue.path.join('.')}] ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Schema validation failed: ${detail}`);
    }
    throw error;
  }
}
