import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  MaxLength,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class AgentConversationMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AgentEditRequestDto {
  @IsString()
  @MaxLength(2000)
  instruction!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  pageId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  selectedId?: string;

  @IsObject()
  @IsOptional()
  draftSchema?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentConversationMessageDto)
  @IsOptional()
  conversationHistory?: AgentConversationMessageDto[];

  @IsString()
  @MaxLength(50)
  @IsOptional()
  provider?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  modelId?: string;

  @Type(() => Number)
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxTokens?: number;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @IsString()
  @IsIn(['schema', 'patch'])
  @IsOptional()
  responseMode?: 'schema' | 'patch';
}
