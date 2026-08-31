/**
 * Compiler 请求 DTO
 */

import { IsDefined, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 编译选项（只接受安全受控选项，禁止客户端覆盖 componentSources / defaultLibrary）
 */
export class CompileOptionsDto {
  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  presetId?: string;
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

  @IsOptional()
  @IsObject()
  options?: CompileOptionsDto;
}
