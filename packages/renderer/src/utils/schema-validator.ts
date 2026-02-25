import { z } from "zod";
import type { A2UISchema } from "../types";

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
      // 校验 rootId 存在于 components
      if (!schema.components[schema.rootId]) return false;
      // 校验所有 childrenIds 引用有效
      for (const comp of Object.values(schema.components)) {
        for (const childId of comp.childrenIds ?? []) {
          if (!schema.components[childId]) return false;
        }
      }
      return true;
    },
    { message: "Schema validation failed: rootId or childrenIds are dangling" },
  );

export function validateSchema(input: unknown): A2UISchema {
  return A2UISchemaValidator.parse(input) as unknown as A2UISchema;
}

export function safeValidateSchema(input: unknown) {
  const result = A2UISchemaValidator.safeParse(input);
  if (result.success) {
    return {
      success: true as const,
      data: result.data as unknown as A2UISchema,
    };
  }
  return { success: false as const, error: result.error };
}

export function validateSchemaWithWhitelist(
  input: unknown,
  whitelist: string[],
) {
  const result = A2UISchemaValidator.safeParse(input);
  if (!result.success) return { success: false as const, error: result.error };

  const schema = result.data as unknown as A2UISchema;
  const unknownTypes: string[] = [];

  for (const comp of Object.values(schema.components)) {
    if (!whitelist.includes(comp.type)) {
      unknownTypes.push(`${comp.id} → ${comp.type}`);
    }
  }

  if (unknownTypes.length > 0) {
    return {
      success: false as const,
      error: {
        issues: [
          {
            message: `未注册的组件类型: ${unknownTypes.join(", ")}`,
          },
        ],
      },
    };
  }

  return { success: true as const, data: schema };
}
