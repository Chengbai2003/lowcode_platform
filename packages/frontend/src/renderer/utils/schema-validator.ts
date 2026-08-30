import type { PageSchema } from '@lowcode-platform/schema-contract';
import {
  safeValidateA2UISchema,
  validateA2UISchema,
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '../../schema/schemaValidation';

export function validateSchema(input: unknown): PageSchema {
  return validateA2UISchema(input);
}

export function safeValidateSchema(input: unknown) {
  return safeValidateA2UISchema(input);
}

export function validateSchemaWithWhitelist(input: unknown, whitelist: string[]) {
  return validateA2UISchemaWithWhitelist(input, whitelist);
}

export function validateAndAutoFix(input: unknown, whitelist: string[] = []) {
  return validateAndAutoFixA2UISchema(input, whitelist);
}
