import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  Min,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export const MAX_SCHEMA_SIZE_BYTES = 1024 * 1024;

function MaxSerializedSize(maxBytes: number, validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'maxSerializedSize',
      target: target.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (value === undefined || value === null) {
            return true;
          }

          try {
            const serialized = JSON.stringify(value);
            return Buffer.byteLength(serialized, 'utf-8') <= (args.constraints[0] as number);
          } catch {
            return false;
          }
        },
      },
    });
  };
}

export class SavePageSchemaDto {
  @IsObject()
  @IsNotEmpty()
  @MaxSerializedSize(MAX_SCHEMA_SIZE_BYTES, {
    message: `schema must not exceed ${MAX_SCHEMA_SIZE_BYTES} bytes when serialized`,
  })
  schema!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @IsOptional()
  baseVersion?: number;
}
