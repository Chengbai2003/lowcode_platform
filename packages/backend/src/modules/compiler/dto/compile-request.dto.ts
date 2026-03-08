/**
 * Compiler 请求 DTO
 */

import { IsObject, IsOptional, IsString, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 编译选项
 */
export class CompileOptionsDto {
  @IsOptional()
  @IsObject()
  componentSources?: Record<string, string>;

  @IsOptional()
  @IsString()
  defaultLibrary?: string;
}

/**
 * A2UI Schema 组件定义
 */
class ComponentDefinition {
  @IsString()
  type!: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, any>;

  @IsOptional()
  @IsObject()
  events?: Record<string, any>;

  @IsOptional()
  childrenIds?: string[];
}

/**
 * A2UI Schema 结构
 */
class A2UISchemaDto {
  @IsString()
  @IsNotEmpty()
  rootId!: string;

  @IsObject()
  components!: Record<string, ComponentDefinition>;

  @IsOptional()
  @IsString()
  version?: string;
}

/**
 * 编译请求 DTO
 */
export class CompileRequestDto {
  @ValidateNested()
  @Type(() => A2UISchemaDto)
  schema!: A2UISchemaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompileOptionsDto)
  options?: CompileOptionsDto;
}
