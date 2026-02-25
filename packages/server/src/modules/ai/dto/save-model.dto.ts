import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from "class-validator";

export class SaveModelDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  provider!: string; // 'openai' | 'anthropic' | 'ollama' | 'custom'

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(128000)
  maxTokens?: number;

  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
