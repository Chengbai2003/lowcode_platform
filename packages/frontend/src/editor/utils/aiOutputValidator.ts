/**
 * AI 输出校验器
 * 校验 AI 返回的内容，防止幻觉和无效数据
 */

import type { A2UISchema } from '../../types';
import type {
  AIOutputValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  ValidationResult,
} from './validationTypes';
import { SchemaValidator } from './schemaValidator';
import { ALLOWED_COMPONENT_TYPES, normalizeComponentType } from '../constants/aiSafetyConfig';

/**
 * 默认 AI 输出校验选项
 */
const DEFAULT_AI_VALIDATION_OPTIONS: ValidationOptions = {
  strict: false,
  allowUnknownTypes: false,
  maxSchemaSize: 1024 * 500, // 500KB for AI output
  maxComponents: 100, // AI 单次生成的组件上限
  maxDepth: 6,
  allowedComponentTypes: ALLOWED_COMPONENT_TYPES,
  sanitizeDangerousValues: true,
};

/**
 * JSON 提取模式
 */
const JSON_EXTRACTION_PATTERNS = [
  // 标准 markdown JSON 代码块
  /```json\s*([\s\S]*?)\s*```/,
  // 无语言标记的代码块
  /```\s*([\s\S]*?)\s*```/,
  // 直接 JSON 对象（包含 rootId）
  /\{[\s\S]*"rootId"[\s\S]*"components"[\s\S]*\}/,
  // 直接 JSON 对象（包含 components）
  /\{[\s\S]*"components"[\s\S]*\}/,
];

/**
 * AI 输出校验器类
 */
export class AIOutputValidator {
  private options: ValidationOptions;
  private schemaValidator: SchemaValidator;

  constructor(options: Partial<ValidationOptions> = {}) {
    this.options = { ...DEFAULT_AI_VALIDATION_OPTIONS, ...options };
    this.schemaValidator = new SchemaValidator(this.options);
  }

  /**
   * 校验 AI 输出内容
   */
  validateOutput(content: string): AIOutputValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 空内容检查
    if (!content || typeof content !== 'string') {
      return {
        valid: false,
        parseSuccess: false,
        errors: [{ path: '', message: 'AI 输出内容为空', type: 'required' }],
        warnings: [],
        originalContent: content,
      };
    }

    // 2. 提取 JSON
    const extractionResult = this.extractJSON(content);
    if (!extractionResult.json) {
      return {
        valid: false,
        parseSuccess: false,
        errors: [
          {
            path: '',
            message: '无法从 AI 输出中提取有效的 JSON Schema',
            type: 'format',
            value: content.slice(0, 200),
            suggestion: '请确保 AI 返回包含 A2UI Schema 的 JSON 格式数据',
          },
        ],
        warnings: [],
        originalContent: content,
      };
    }

    // 3. 解析 JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(extractionResult.json);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      return {
        valid: false,
        parseSuccess: false,
        errors: [
          {
            path: '',
            message: `JSON 解析失败: ${errorMessage}`,
            type: 'format',
            value: extractionResult.json.slice(0, 200),
            suggestion: '检查 JSON 语法，确保没有尾随逗号、缺少引号等问题',
          },
        ],
        warnings: [],
        originalContent: content,
        extractedJSON: extractionResult.json,
      };
    }

    // 4. 校验 Schema 结构
    const schemaResult = this.schemaValidator.validate(parsedData);
    const result = {
      valid: schemaResult.valid,
      parseSuccess: true,
      errors: [...errors, ...schemaResult.errors],
      warnings: [...warnings, ...(schemaResult.warnings || [])],
      fixed: schemaResult.fixed,
      fixes: schemaResult.fixes,
      originalContent: content,
      extractedJSON: extractionResult.json,
      sanitizedData: schemaResult.sanitizedData,
    };

    return result;
  }

  /**
   * 校验 AI 返回的 Schema（仅校验，不自动修复）
   */
  validateSchema(schema: unknown): ValidationResult {
    return this.schemaValidator.validate(schema);
  }

  /**
   * 从 AI 输出中提取 JSON
   */
  private extractJSON(content: string): {
    json: string | null;
    pattern: string;
  } {
    for (const pattern of JSON_EXTRACTION_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        let jsonStr = match[1] || match[0];

        // 清理常见的格式问题
        jsonStr = this.cleanJSON(jsonStr);

        return { json: jsonStr, pattern: pattern.source };
      }
    }

    return { json: null, pattern: '' };
  }

  /**
   * 清理 JSON 字符串中的常见问题
   */
  private cleanJSON(jsonStr: string): string {
    return (
      jsonStr
        // 移除尾随逗号
        .replace(/,\s*([}\]])/g, '$1')
        // 移除单行注释
        .replace(/\/\/.*$/gm, '')
        // 移除多行注释
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // 修复单引号（尝试转换为双引号）
        .replace(/'/g, '"')
        // 移除不可见字符（控制字符是故意用于清理不可见字符）
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        // 修复多余的空白
        .trim()
    );
  }

  /**
   * 校验组件类型是否注册
   */
  validateComponentType(type: string): {
    valid: boolean;
    normalized?: string;
    suggestion?: string;
  } {
    const whitelist = this.options.allowedComponentTypes || ALLOWED_COMPONENT_TYPES;

    if (whitelist.includes(type)) {
      return { valid: true, normalized: type };
    }

    const normalized = normalizeComponentType(type);
    if (whitelist.includes(normalized)) {
      return {
        valid: true,
        normalized,
        suggestion: `组件类型 "${type}" 已自动修正为 "${normalized}"`,
      };
    }

    // 寻找相似的组件类型
    const similarTypes = this.findSimilarComponentTypes(type);
    return {
      valid: false,
      suggestion:
        similarTypes.length > 0
          ? `未找到组件类型 "${type}"，您是否想使用: ${similarTypes.join(', ')}?`
          : `组件类型 "${type}" 未注册，请使用有效的组件类型`,
    };
  }

  /**
   * 寻找相似的组件类型
   */
  private findSimilarComponentTypes(type: string): string[] {
    const whitelist = this.options.allowedComponentTypes || ALLOWED_COMPONENT_TYPES;
    const lowerType = type.toLowerCase();

    return whitelist
      .filter((t) => {
        const lowerT = t.toLowerCase();
        return (
          lowerT.includes(lowerType) ||
          lowerType.includes(lowerT) ||
          this.levenshteinDistance(lowerType, lowerT) <= 3
        );
      })
      .slice(0, 3);
  }

  /**
   * 计算编辑距离
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * 快捷校验函数
 */
export function validateAIOutput(
  content: string,
  options?: Partial<ValidationOptions>,
): AIOutputValidationResult {
  const validator = new AIOutputValidator(options);
  return validator.validateOutput(content);
}

/**
 * 校验并提取 Schema
 */
export function extractAndValidateSchema(
  content: string,
  options?: Partial<ValidationOptions>,
): { schema: A2UISchema | null; result: AIOutputValidationResult } {
  const validator = new AIOutputValidator(options);
  const result = validator.validateOutput(content);

  return {
    schema: result.sanitizedData as A2UISchema | null,
    result,
  };
}

/**
 * 快速检查 AI 输出是否包含有效的 Schema
 */
export function hasValidSchema(content: string, options?: Partial<ValidationOptions>): boolean {
  const result = validateAIOutput(content, options);
  return result.valid && result.parseSuccess;
}

/**
 * 安全解析 AI 返回的 JSON
 */
export function safeParseAIJSON<T = unknown>(
  content: string,
  options?: Partial<ValidationOptions>,
): { data: T | null; errors: ValidationError[] } {
  const validator = new AIOutputValidator(options);

  // 尝试提取 JSON
  const extractionResult = validator['extractJSON'](content);

  if (!extractionResult.json) {
    return {
      data: null,
      errors: [
        {
          path: '',
          message: '无法从内容中提取 JSON',
          type: 'format',
        },
      ],
    };
  }

  try {
    const data = JSON.parse(extractionResult.json) as T;
    return { data, errors: [] };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return {
      data: null,
      errors: [
        {
          path: '',
          message: `JSON 解析失败: ${errorMessage}`,
          type: 'format',
        },
      ],
    };
  }
}
