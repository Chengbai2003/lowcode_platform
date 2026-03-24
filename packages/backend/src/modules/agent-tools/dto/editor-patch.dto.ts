import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PATCH_OPERATION_TYPES } from '../types/editor-patch.types';

export class EditorPatchOperationDto {
  @IsString()
  @IsIn(PATCH_OPERATION_TYPES)
  op!: (typeof PATCH_OPERATION_TYPES)[number];

  @IsString()
  @IsOptional()
  parentId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  index?: number;

  @IsObject()
  @IsOptional()
  component?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  componentId?: string;

  @IsObject()
  @IsOptional()
  props?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  event?: string;

  @IsArray()
  @IsOptional()
  actions?: Array<Record<string, unknown>>;

  @IsString()
  @IsOptional()
  newParentId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  newIndex?: number;
}
