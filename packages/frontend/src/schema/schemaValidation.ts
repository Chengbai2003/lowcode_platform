import { z } from 'zod';
import type { A2UISchema } from '../types';
import { autoFixSchema } from '../renderer/utils/schema-auto-fix';

const A2UIComponentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.string(), z.any()).optional(),
  childrenIds: z.array(z.string()).optional(),
  events: z.record(z.string(), z.array(z.any())).optional(),
});

export const A2UISchemaValidator = z
  .object({
    version: z.number().default(1),
    rootId: z.string().min(1),
    components: z.record(z.string(), A2UIComponentSchema),
  })
  .refine(
    (schema) => {
      if (!schema.components[schema.rootId]) return false;

      for (const comp of Object.values(schema.components)) {
        for (const childId of comp.childrenIds ?? []) {
          if (!schema.components[childId]) return false;
        }
      }

      return true;
    },
    { message: 'Schema validation failed: rootId or childrenIds are dangling' },
  );

type ValidationIssueLike = {
  message: string;
  path?: Array<string | number>;
};

export type SharedSchemaError = {
  issues: ValidationIssueLike[];
};

export type SharedSchemaSuccess = {
  success: true;
  data: A2UISchema;
};

export type SharedSchemaFailure = {
  success: false;
  error: SharedSchemaError;
};

type SharedSchemaAutoFixSuccess = SharedSchemaSuccess & {
  fixes: string[];
};

type SharedSchemaAutoFixFailure = SharedSchemaFailure & {
  data: A2UISchema | null;
  fixes: string[];
};

function toSharedError(error: unknown): SharedSchemaError {
  if (error instanceof z.ZodError) {
    return {
      issues: error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number',
        ),
      })),
    };
  }

  if (
    error &&
    typeof error === 'object' &&
    Array.isArray((error as { issues?: unknown[] }).issues)
  ) {
    return error as SharedSchemaError;
  }

  return {
    issues: [
      {
        message: error instanceof Error ? error.message : 'Unknown schema validation error',
      },
    ],
  };
}

function validateWhitelist(schema: A2UISchema, whitelist: string[]): SharedSchemaFailure | null {
  if (whitelist.length === 0) {
    return null;
  }

  const unknownTypes: string[] = [];

  for (const comp of Object.values(schema.components)) {
    if (!whitelist.includes(comp.type)) {
      unknownTypes.push(`${comp.id} → ${comp.type}`);
    }
  }

  if (unknownTypes.length === 0) {
    return null;
  }

  return {
    success: false,
    error: {
      issues: [
        {
          message: `未注册的组件类型: ${unknownTypes.join(', ')}`,
        },
      ],
    },
  };
}

export function validateA2UISchema(input: unknown): A2UISchema {
  return A2UISchemaValidator.parse(input) as unknown as A2UISchema;
}

export function safeValidateA2UISchema(input: unknown): SharedSchemaSuccess | SharedSchemaFailure {
  const result = A2UISchemaValidator.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: toSharedError(result.error),
    };
  }

  return {
    success: true,
    data: result.data as unknown as A2UISchema,
  };
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
  const baseResult = z
    .object({
      version: z.union([z.number(), z.string()]).optional(),
      rootId: z.string().optional(),
      components: z.record(z.string(), z.any()).optional(),
    })
    .safeParse(input);

  if (!baseResult.success) {
    return {
      success: false,
      data: null,
      fixes: [],
      error: toSharedError(baseResult.error),
    };
  }

  const { fixed, fixes } = autoFixSchema(input, whitelist);
  const finalResult = safeValidateA2UISchema(fixed);

  if (!finalResult.success) {
    return {
      success: false,
      data: fixed as A2UISchema,
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
