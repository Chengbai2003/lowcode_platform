import { z } from 'zod';
import type { A2UISchema } from '../../types';
import { autoFixSchema } from './schema-auto-fix';

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
    { message: 'Schema validation failed: rootId or childrenIds are dangling' },
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

export function validateSchemaWithWhitelist(input: unknown, whitelist: string[]) {
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
            message: `未注册的组件类型: ${unknownTypes.join(', ')}`,
          },
        ],
      },
    };
  }

  return { success: true as const, data: schema };
}

/**
 * 验证并自动修复 Schema
 *
 * @param input 原始输入对象
 * @param whitelist 已注册的组件类型列表
 * @returns 验证/修复后的结果
 */
export function validateAndAutoFix(input: unknown, whitelist: string[] = []) {
  // 1. 先进行结构验证，如果不满足基础 JSON 结构则直接报错
  // 这里使用 A2UISchemaValidator 的基础部分，但不强制逻辑引用完整
  const baseResult = z
    .object({
      version: z.number().optional(),
      rootId: z.string().optional(),
      components: z.record(z.string(), z.any()).optional(),
    })
    .safeParse(input);

  if (!baseResult.success) {
    return {
      success: false as const,
      data: null,
      fixes: [],
      error: baseResult.error,
    };
  }

  // 2. 执行自动修复逻辑
  const { fixed, fixes } = autoFixSchema(input, whitelist);

  // 3. 对修复后的结果进行严格验证
  const finalResult = A2UISchemaValidator.safeParse(fixed);

  if (!finalResult.success) {
    return {
      success: false as const,
      data: fixed as unknown as A2UISchema,
      fixes,
      error: finalResult.error,
    };
  }

  // 4. 白名单校验（组件类型校验）
  const schema = finalResult.data as unknown as A2UISchema;
  const unknownTypes: string[] = [];

  for (const comp of Object.values(schema.components)) {
    if (whitelist.length > 0 && !whitelist.includes(comp.type)) {
      unknownTypes.push(`${comp.id} → ${comp.type}`);
    }
  }

  if (unknownTypes.length > 0) {
    return {
      success: false as const,
      data: schema,
      fixes,
      error: {
        issues: [
          {
            message: `存在未注册的组件类型: ${unknownTypes.join(', ')}`,
          },
        ],
      },
    };
  }

  return {
    success: true as const,
    data: schema,
    fixes,
  };
}
