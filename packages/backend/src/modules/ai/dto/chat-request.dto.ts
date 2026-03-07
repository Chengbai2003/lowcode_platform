/**
 * 聊天请求 DTO
 */

import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  ValidateNested,
  Allow,
  Min,
  Max,
} from "class-validator";
import { Type, Exclude, Expose } from "class-transformer";

export enum MessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
  DATA = "data",
  TOOL = "tool",
}

/**
 * 消息 DTO
 * 与 AI SDK 的 ModelMessage 格式兼容
 */
export class ChatMessageDto {
  @IsString()
  role!: string;

  @Allow()
  content!: any; // string | ContentPart[] — ai-sdk 支持多种格式
}

export class ChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  modelId?: string; // 用户自定义模型ID

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  temperature?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  maxTokens?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  topP?: number;

  @IsNumber()
  @IsOptional()
  @Min(-2)
  @Max(2)
  @Type(() => Number)
  frequencyPenalty?: number;

  @IsNumber()
  @IsOptional()
  @Min(-2)
  @Max(2)
  @Type(() => Number)
  presencePenalty?: number;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  stream?: boolean;

  @IsString({ each: true })
  @IsOptional()
  stop?: string | string[];
}

/**
 * 代码生成请求 DTO
 */
export class GenerateSchemaDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  temperature?: number;
}
