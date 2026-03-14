import type { A2UISchema } from '../../types';
import {
  A2UISchemaValidator,
  safeValidateA2UISchema,
  validateA2UISchema,
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '../../schema/schemaValidation';

export { A2UISchemaValidator };

export function validateSchema(input: unknown): A2UISchema {
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
