/**
 * AI 校验错误恢复机制
 * 提供降级策略、错误修复建议和失败记录
 */

import type { A2UISchema, A2UIComponent } from '../../types';
import type {
  ValidationError,
  ValidationWarning,
  AIOutputValidationResult,
} from './validationTypes';
import { validateSchema } from './schemaValidator';
import { validateAIOutput, extractAndValidateSchema } from './aiOutputValidator';
import { normalizeComponentType } from '../constants/aiSafetyConfig';

/**
 * 校验失败记录
 */
export interface ValidationFailureRecord {
  id: string;
  timestamp: number;
  originalContent: string;
  extractedJSON?: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  attemptedFixes: string[];
  recoveryStrategy: RecoveryStrategy;
  recoveredSchema?: A2UISchema;
  success: boolean;
}

/**
 * 恢复策略类型
 */
export type RecoveryStrategy =
  | 'auto_fix' // 自动修复
  | 'partial_apply' // 部分应用
  | 'fallback_default' // 使用默认值
  | 'reject' // 拒绝应用
  | 'manual_review'; // 需要人工审核

/**
 * 恢复结果
 */
export interface RecoveryResult {
  success: boolean;
  schema: A2UISchema | null;
  strategy: RecoveryStrategy;
  fixes: string[];
  warnings: string[];
  originalErrors: ValidationError[];
}

/**
 * 错误修复建议
 */
export interface ErrorFixSuggestion {
  error: ValidationError;
  suggestions: string[];
  autoFixable: boolean;
  fixCommand?: string;
}

/**
 * 失败记录存储（内存中，用于分析改进）
 */
const failureRecords: ValidationFailureRecord[] = [];
const MAX_RECORDS = 100;

/**
 * 错误恢复管理器
 */
export class ErrorRecoveryManager {
  private defaultSchema: A2UISchema;
  private onRecovery?: (record: ValidationFailureRecord) => void;

  constructor(options?: {
    defaultSchema?: A2UISchema;
    onRecovery?: (record: ValidationFailureRecord) => void;
  }) {
    this.defaultSchema = options?.defaultSchema || this.createDefaultSchema();
    this.onRecovery = options?.onRecovery;
  }

  /**
   * 处理校验失败
   */
  handleValidationFailure(content: string, result: AIOutputValidationResult): RecoveryResult {
    const recordId = this.generateRecordId();
    const timestamp = Date.now();

    // 确定恢复策略
    const strategy = this.determineRecoveryStrategy(result);

    // 尝试恢复
    const recoveryResult = this.attemptRecovery(content, result, strategy);

    // 记录失败
    const record: ValidationFailureRecord = {
      id: recordId,
      timestamp,
      originalContent: content,
      extractedJSON: result.extractedJSON,
      errors: result.errors,
      warnings: result.warnings || [],
      attemptedFixes: recoveryResult.fixes,
      recoveryStrategy: strategy,
      recoveredSchema: recoveryResult.schema || undefined,
      success: recoveryResult.success,
    };

    this.recordFailure(record);

    return recoveryResult;
  }

  /**
   * 确定恢复策略
   */
  private determineRecoveryStrategy(result: AIOutputValidationResult): RecoveryStrategy {
    const errors = result.errors;

    // 如果没有错误，直接接受
    if (errors.length === 0) {
      return 'auto_fix';
    }

    // 检查错误类型分布
    const errorTypes = new Set(errors.map((e) => e.type));

    // 只有未知组件类型错误 -> 自动修复
    if (errorTypes.size === 1 && errorTypes.has('unknown')) {
      return 'auto_fix';
    }

    // 只有引用错误 -> 自动修复
    if (errorTypes.size === 1 && errorTypes.has('reference')) {
      return 'auto_fix';
    }

    // 只有格式错误 -> 尝试自动修复
    if (errorTypes.size === 1 && errorTypes.has('format')) {
      return 'auto_fix';
    }

    // 包含安全错误 -> 拒绝
    if (errorTypes.has('security')) {
      return 'reject';
    }

    // 错误数量过多 -> 需要人工审核
    if (errors.length > 10) {
      return 'manual_review';
    }

    // 其他情况 -> 部分应用
    return 'partial_apply';
  }

  /**
   * 尝试恢复
   */
  private attemptRecovery(
    content: string,
    result: AIOutputValidationResult,
    strategy: RecoveryStrategy,
  ): RecoveryResult {
    switch (strategy) {
      case 'reject':
        return {
          success: false,
          schema: null,
          strategy,
          fixes: [],
          warnings: ['Schema 包含安全风险，已被拒绝'],
          originalErrors: result.errors,
        };

      case 'fallback_default':
        return {
          success: true,
          schema: this.defaultSchema,
          strategy,
          fixes: ['使用默认 Schema'],
          warnings: ['AI 生成的 Schema 无效，已使用默认 Schema'],
          originalErrors: result.errors,
        };

      case 'manual_review':
        return {
          success: false,
          schema: null,
          strategy,
          fixes: [],
          warnings: ['Schema 需要人工审核'],
          originalErrors: result.errors,
        };

      case 'auto_fix':
      case 'partial_apply':
        return this.attemptAutoFix(content, result, strategy);

      default:
        return {
          success: false,
          schema: null,
          strategy: 'reject',
          fixes: [],
          warnings: ['未知的恢复策略'],
          originalErrors: result.errors,
        };
    }
  }

  /**
   * 尝试自动修复
   */
  private attemptAutoFix(
    content: string,
    result: AIOutputValidationResult,
    strategy: RecoveryStrategy,
  ): RecoveryResult {
    const fixes: string[] = [];
    const warnings: string[] = [];

    // 如果已经有修复后的数据
    if (result.sanitizedData && result.fixed) {
      const schema = result.sanitizedData as A2UISchema;

      // 再次验证修复后的数据
      const revalidateResult = validateSchema(schema);

      if (revalidateResult.valid) {
        return {
          success: true,
          schema,
          strategy,
          fixes: result.fixes || [],
          warnings: revalidateResult.warnings?.map((w) => w.message) || [],
          originalErrors: result.errors,
        };
      }

      // 修复后仍有错误
      fixes.push(...(result.fixes || []));

      if (strategy === 'partial_apply') {
        // 尝试部分应用：移除有问题的组件
        const partialResult = this.applyPartialFix(schema, revalidateResult.errors);
        if (partialResult.schema) {
          return {
            success: true,
            schema: partialResult.schema,
            strategy,
            fixes: [...fixes, ...partialResult.fixes],
            warnings: [...warnings, ...partialResult.warnings],
            originalErrors: result.errors,
          };
        }
      }
    }

    // 尝试重新提取和修复
    const extractResult = extractAndValidateSchema(content, { strict: false });
    if (extractResult.schema && extractResult.result.valid) {
      return {
        success: true,
        schema: extractResult.schema,
        strategy,
        fixes: ['重新提取并修复 Schema'],
        warnings: extractResult.result.warnings?.map((w) => w.message) || [],
        originalErrors: result.errors,
      };
    }

    // 无法恢复
    return {
      success: false,
      schema: null,
      strategy,
      fixes,
      warnings: ['无法自动修复 Schema'],
      originalErrors: result.errors,
    };
  }

  /**
   * 应用部分修复
   */
  private applyPartialFix(
    schema: A2UISchema,
    errors: ValidationError[],
  ): { schema: A2UISchema | null; fixes: string[]; warnings: string[] } {
    const fixes: string[] = [];
    const warnings: string[] = [];

    // 找出所有有问题的组件 ID
    const problematicComponents = new Set<string>();
    for (const error of errors) {
      const match = error.path.match(/components\.([^.]+)/);
      if (match) {
        problematicComponents.add(match[1]);
      }
    }

    if (problematicComponents.size === 0) {
      return { schema: null, fixes, warnings };
    }

    // 创建新的 Schema，移除有问题的组件
    const newComponents: Record<string, A2UIComponent> = {};
    for (const [id, component] of Object.entries(schema.components)) {
      if (!problematicComponents.has(id)) {
        newComponents[id] = component;
      } else {
        fixes.push(`移除有问题的组件: ${id}`);
      }
    }

    // 更新 childrenIds 引用
    for (const component of Object.values(newComponents)) {
      if (component.childrenIds) {
        const newChildrenIds = component.childrenIds.filter(
          (childId) => !problematicComponents.has(childId),
        );
        if (newChildrenIds.length !== component.childrenIds.length) {
          component.childrenIds = newChildrenIds;
          fixes.push(`更新组件 ${component.id} 的子节点引用`);
        }
      }
    }

    // 检查 rootId 是否被移除
    let newRootId = schema.rootId;
    if (problematicComponents.has(schema.rootId)) {
      const remainingKeys = Object.keys(newComponents);
      if (remainingKeys.length > 0) {
        newRootId = remainingKeys[0];
        fixes.push(`更新 rootId 为 ${newRootId}`);
      } else {
        warnings.push('所有组件都有问题，无法部分应用');
        return { schema: null, fixes, warnings };
      }
    }

    const newSchema: A2UISchema = {
      ...schema,
      rootId: newRootId,
      components: newComponents,
    };

    // 验证新 Schema
    const validateResult = validateSchema(newSchema);
    if (!validateResult.valid) {
      warnings.push('部分修复后的 Schema 仍然无效');
      return { schema: null, fixes, warnings };
    }

    warnings.push(`已移除 ${problematicComponents.size} 个有问题的组件`);

    return { schema: newSchema, fixes, warnings };
  }

  /**
   * 创建默认 Schema
   */
  private createDefaultSchema(): A2UISchema {
    return {
      version: 1,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          props: { title: '新页面' },
          childrenIds: [],
        },
      },
    };
  }

  /**
   * 生成记录 ID
   */
  private generateRecordId(): string {
    return `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 记录失败
   */
  private recordFailure(record: ValidationFailureRecord): void {
    failureRecords.unshift(record);

    // 保持记录数量限制
    while (failureRecords.length > MAX_RECORDS) {
      failureRecords.pop();
    }

    // 触发回调
    this.onRecovery?.(record);
  }

  /**
   * 获取失败记录
   */
  getFailureRecords(): ValidationFailureRecord[] {
    return [...failureRecords];
  }

  /**
   * 分析失败记录
   */
  analyzeFailures(): {
    totalFailures: number;
    errorTypeDistribution: Record<string, number>;
    recoverySuccessRate: number;
    commonIssues: string[];
  } {
    const records = failureRecords;

    if (records.length === 0) {
      return {
        totalFailures: 0,
        errorTypeDistribution: {},
        recoverySuccessRate: 1,
        commonIssues: [],
      };
    }

    // 统计错误类型分布
    const errorTypeDistribution: Record<string, number> = {};
    for (const record of records) {
      for (const error of record.errors) {
        errorTypeDistribution[error.type] = (errorTypeDistribution[error.type] || 0) + 1;
      }
    }

    // 计算恢复成功率
    const successCount = records.filter((r) => r.success).length;
    const recoverySuccessRate = successCount / records.length;

    // 找出常见问题
    const errorMessages: Record<string, number> = {};
    for (const record of records) {
      for (const error of record.errors) {
        const key = error.message.slice(0, 50);
        errorMessages[key] = (errorMessages[key] || 0) + 1;
      }
    }

    const commonIssues = Object.entries(errorMessages)
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([msg]) => msg);

    return {
      totalFailures: records.length,
      errorTypeDistribution,
      recoverySuccessRate,
      commonIssues,
    };
  }
}

/**
 * 生成错误修复建议
 */
export function generateFixSuggestions(errors: ValidationError[]): ErrorFixSuggestion[] {
  return errors.map((error) => {
    const suggestion: ErrorFixSuggestion = {
      error,
      suggestions: [],
      autoFixable: false,
    };

    switch (error.type) {
      case 'unknown':
        suggestion.suggestions = [
          `使用已注册的组件类型替代 "${error.value}"`,
          `检查组件类型名称是否拼写正确`,
        ];
        suggestion.autoFixable = true;
        suggestion.fixCommand = `component.type = "${normalizeComponentType(String(error.value))}"`;
        break;

      case 'required':
        suggestion.suggestions = [`为属性 "${error.path.split('.').pop()}" 提供值`];
        suggestion.autoFixable = false;
        break;

      case 'type':
        suggestion.suggestions = [`检查属性类型是否正确`, `确保值是期望的类型`];
        suggestion.autoFixable = false;
        break;

      case 'reference':
        suggestion.suggestions = [`确保引用的组件存在`, `检查 ID 是否正确`];
        suggestion.autoFixable = true;
        break;

      case 'format':
        suggestion.suggestions = [`检查 JSON 格式是否正确`, `确保没有语法错误`];
        suggestion.autoFixable = false;
        break;

      case 'security':
        suggestion.suggestions = [`移除或替换危险的内容`, `使用安全的方式实现功能`];
        suggestion.autoFixable = true;
        break;

      case 'constraint':
        suggestion.suggestions = [`确保值在允许的范围内`, `检查约束条件`];
        suggestion.autoFixable = false;
        break;

      default:
        suggestion.suggestions = ['检查并修复该问题'];
        suggestion.autoFixable = false;
    }

    if (error.suggestion) {
      suggestion.suggestions.unshift(error.suggestion);
    }

    return suggestion;
  });
}

/**
 * 全局错误恢复管理器实例
 */
let globalRecoveryManager: ErrorRecoveryManager | null = null;

/**
 * 获取全局错误恢复管理器
 */
export function getRecoveryManager(
  options?: ConstructorParameters<typeof ErrorRecoveryManager>[0],
): ErrorRecoveryManager {
  if (!globalRecoveryManager) {
    globalRecoveryManager = new ErrorRecoveryManager(options);
  }
  return globalRecoveryManager;
}

/**
 * 便捷函数：校验并恢复
 */
export function validateAndRecover(
  content: string,
  options?: {
    onRecovery?: (record: ValidationFailureRecord) => void;
    defaultSchema?: A2UISchema;
  },
): RecoveryResult {
  const result = validateAIOutput(content);

  if (result.valid) {
    return {
      success: true,
      schema: result.sanitizedData as A2UISchema,
      strategy: 'auto_fix',
      fixes: result.fixes || [],
      warnings: result.warnings?.map((w) => w.message) || [],
      originalErrors: [],
    };
  }

  const manager = getRecoveryManager(options);
  return manager.handleValidationFailure(content, result);
}
