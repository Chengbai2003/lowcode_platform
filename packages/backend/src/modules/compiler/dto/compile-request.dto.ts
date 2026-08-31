/**
 * Compiler 请求 DTO
 */

import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsObject, IsString, Min, ValidateNested } from 'class-validator';

/**
 * 编译目标。组件导入绑定只从该页面快照的 runtimeCompatibility 推导。
 */
export class CompileOptionsDto {
  @IsString()
  pageId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageVersion!: number;
}

/**
 * 编译请求 DTO
 * 遵循 Contract 统一校验原则：DTO 不使用 Record<string, any>，
 * 不对 schema 使用 @ValidateNested / @Type(A2UISchemaDto)，
 * 由 CompilerService 显式调用 validatePageSchemaValue 进行 Contract 级 fail-close 校验。
 */
export class CompileRequestDto {
  @IsDefined()
  @IsObject()
  schema!: Record<string, unknown>;

  @IsObject()
  @ValidateNested()
  @Type(() => CompileOptionsDto)
  options!: CompileOptionsDto;
}
