import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EditorPatchOperationDto } from './editor-patch.dto';

export class PatchPreviewRequestDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  pageId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;

  @IsObject()
  @IsOptional()
  draftSchema?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EditorPatchOperationDto)
  patch!: EditorPatchOperationDto[];

  @IsBoolean()
  @IsOptional()
  autoFix?: boolean;
}
