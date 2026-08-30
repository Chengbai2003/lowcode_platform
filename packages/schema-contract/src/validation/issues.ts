import type { PageSchema } from '../types/schema';
import { describeValue } from './describe';

export interface SchemaContractIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type ParsePageSchemaResult =
  | { readonly ok: true; readonly value: PageSchema }
  | { readonly ok: false; readonly issues: readonly SchemaContractIssue[] };

export class SchemaValidationError extends Error {
  readonly issues: readonly SchemaContractIssue[];

  constructor(issues: readonly SchemaContractIssue[]) {
    super(
      `Schema validation failed: ${issues.map((i) => `[${i.path.join('.')}] ${i.message}`).join('; ')}`,
    );
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

export class UnsupportedSchemaVersionError extends SchemaValidationError {
  constructor(version: unknown) {
    super([
      {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        path: ['schemaVersion'],
        message: `Unsupported schemaVersion: ${describeValue(version)}`,
      },
    ]);
    this.name = 'UnsupportedSchemaVersionError';
  }
}
