import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetPageSchemaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
