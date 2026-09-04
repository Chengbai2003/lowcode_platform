import type { PageSchema } from '../../types';
import {
  validateA2UISchemaWithWhitelist,
  type SharedSchemaIssue,
} from '../../schema/schemaValidation';

export type PageLogicValidationResult =
  | { success: true; data: PageSchema }
  | { success: false; issues: SharedSchemaIssue[] };

/**
 * 序列化 PageSchema.logic 为可编辑的 JSON 字符串。
 * 无 logic 时输出 '{}'。
 */
export function serializePageLogic(logic: unknown): string {
  if (!logic || typeof logic !== 'object' || Array.isArray(logic)) {
    return '{}';
  }
  return JSON.stringify(logic, null, 2);
}

/**
 * 校验并组合 Page Logic 片段为完整 canonical PageSchema。
 *
 * 1. JSON 解析失败时返回稳定的 code='JSON_PARSE_ERROR'，path=['logic']。
 * 2. 片段与现有 Schema 组合为候选对象，由 Contract + Whitelist 完成全量校验。
 * 3. 校验成功返回深冻结、规范化的 canonical PageSchema。
 */
export function parseAndValidatePageLogic(
  rawJson: string,
  currentSchema: PageSchema,
  whitelist: string[],
): PageLogicValidationResult {
  let parsedLogic: unknown;
  try {
    parsedLogic = JSON.parse(rawJson);
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          code: 'JSON_PARSE_ERROR',
          path: ['logic'],
          message: error instanceof Error ? error.message : 'Invalid JSON format',
        },
      ],
    };
  }

  if (parsedLogic === null || typeof parsedLogic !== 'object' || Array.isArray(parsedLogic)) {
    return {
      success: false,
      issues: [
        {
          code: 'INVALID_LOGIC_OBJECT',
          path: ['logic'],
          message: 'Page logic must be an object',
        },
      ],
    };
  }

  const candidateSchema: unknown = {
    ...currentSchema,
    logic: parsedLogic,
  };

  const result = validateA2UISchemaWithWhitelist(candidateSchema, whitelist);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * 校验并转换整页 JSON 字符串为 PageSchema，保留结构化诊断信息。
 */
export function parseAndValidateFullSchema(
  rawJson: string,
  whitelist: string[],
): PageLogicValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          code: 'JSON_PARSE_ERROR',
          path: [],
          message: error instanceof Error ? error.message : 'Invalid JSON format',
        },
      ],
    };
  }

  const result = validateA2UISchemaWithWhitelist(parsed, whitelist);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
