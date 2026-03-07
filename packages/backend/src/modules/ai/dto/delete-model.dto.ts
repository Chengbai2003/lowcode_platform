import { IsString, IsNotEmpty } from "class-validator";

export class DeleteModelDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}
