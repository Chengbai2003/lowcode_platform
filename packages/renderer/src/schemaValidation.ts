import {
  requireSupportedPageSchema,
  SchemaValidationError,
} from '@lowcode-platform/schema-contract';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { autoFixSchema, UnsafeSchemaInputError } from './utils/schema-auto-fix';

export interface SharedSchemaIssue {
  code: string;
  path: Array<string | number>;
  message: string;
}

export type SharedSchemaError = {
  issues: SharedSchemaIssue[];
};

export type SharedSchemaSuccess = {
  success: true;
  data: PageSchema;
};

export type SharedSchemaFailure = {
  success: false;
  error: SharedSchemaError;
};

type SharedSchemaAutoFixSuccess = SharedSchemaSuccess & {
  fixes: string[];
};

type SharedSchemaAutoFixFailure = SharedSchemaFailure & {
  data: PageSchema | null;
  fixes: string[];
};

function toSharedError(error: unknown): SharedSchemaError {
  if (error instanceof SchemaValidationError) {
    return {
      issues: error.issues.map((issue) => ({
        code: issue.code,
        path: [...issue.path],
        message: issue.message,
      })),
    };
  }

  return {
    issues: [
      {
        code: 'SCHEMA_VALIDATION_ERROR',
        path: [],
        message: error instanceof Error ? error.message : 'Unknown schema validation error',
      },
    ],
  };
}

function validateWhitelist(schema: PageSchema, whitelist: string[]): SharedSchemaFailure | null {
  if (whitelist.length === 0) {
    return null;
  }

  const unknownComponents: Array<{ id: string; type: string }> = [];

  for (const comp of Object.values(schema.components)) {
    if (!whitelist.includes(comp.type)) {
      unknownComponents.push({ id: comp.id, type: comp.type });
    }
  }

  if (unknownComponents.length === 0) {
    return null;
  }

  return {
    success: false,
    error: {
      issues: unknownComponents.map(({ id, type }) => ({
        code: 'UNKNOWN_COMPONENT_TYPE',
        path: ['components', id, 'type'],
        message: `未注册的组件类型: ${id} → ${type}`,
      })),
    },
  };
}

/**
 * 渲染器边界校验：Contract 单一真相源（fail-close），返回 canonical 深冻结对象。
 */
export function validateA2UISchema(input: unknown): PageSchema {
  return requireSupportedPageSchema(input);
}

export function safeValidateA2UISchema(input: unknown): SharedSchemaSuccess | SharedSchemaFailure {
  try {
    return {
      success: true,
      data: requireSupportedPageSchema(input),
    };
  } catch (error) {
    return {
      success: false,
      error: toSharedError(error),
    };
  }
}

export function validateA2UISchemaWithWhitelist(
  input: unknown,
  whitelist: string[],
): SharedSchemaSuccess | SharedSchemaFailure {
  const base = safeValidateA2UISchema(input);
  if (!base.success) {
    return base;
  }

  const whitelistResult = validateWhitelist(base.data, whitelist);
  if (whitelistResult) {
    return whitelistResult;
  }

  return base;
}

export function validateAndAutoFixA2UISchema(
  input: unknown,
  whitelist: string[] = [],
): SharedSchemaAutoFixSuccess | SharedSchemaAutoFixFailure {
  const inputLooksLikeObject = input !== null && typeof input === 'object' && !Array.isArray(input);

  if (!inputLooksLikeObject) {
    return {
      success: false,
      data: null,
      fixes: [],
      error: {
        issues: [
          {
            code: 'INVALID_SCHEMA_OBJECT',
            path: [],
            message: 'Schema must be an object',
          },
        ],
      },
    };
  }

  let fixed: PageSchema | null = null;
  let autoFixes: string[] = [];
  try {
    const result = autoFixSchema(input, whitelist);
    fixed = result.fixed;
    autoFixes = result.fixes;
  } catch (error) {
    if (error instanceof UnsafeSchemaInputError) {
      return {
        success: false,
        data: null,
        fixes: [],
        error: {
          issues: [
            {
              code: 'UNSAFE_SCHEMA_INPUT',
              path: [],
              message: error.message,
            },
          ],
        },
      };
    }
    throw error;
  }
  const fixes = autoFixes;
  const finalResult = safeValidateA2UISchema(fixed);

  if (!finalResult.success) {
    return {
      success: false,
      data: fixed as PageSchema,
      fixes,
      error: finalResult.error,
    };
  }

  const whitelistResult = validateWhitelist(finalResult.data, whitelist);
  if (whitelistResult) {
    return {
      success: false,
      data: finalResult.data,
      fixes,
      error: whitelistResult.error,
    };
  }

  return {
    success: true,
    data: finalResult.data,
    fixes,
  };
}
