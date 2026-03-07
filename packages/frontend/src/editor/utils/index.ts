/**
 * AI 防幻觉校验工具
 * 导出所有校验相关的函数和类型
 */

// 类型定义
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  ValidationErrorType,
  AIOutputValidationResult,
  ValidationStats,
  AISafetyConfig,
  ValidationContext,
  ComponentPropertyMeta,
  PropertyDefinition,
} from "./validationTypes";

// Schema 校验
export {
  SchemaValidator,
  validateSchema,
  isValidSchema,
  validateAndFixSchema,
} from "./schemaValidator";

// AI 输出校验
export {
  AIOutputValidator,
  validateAIOutput,
  extractAndValidateSchema,
  hasValidSchema,
  safeParseAIJSON,
} from "./aiOutputValidator";

// 错误恢复
export {
  ErrorRecoveryManager,
  getRecoveryManager,
  validateAndRecover,
  generateFixSuggestions,
} from "./errorRecovery";

export type {
  ValidationFailureRecord,
  RecoveryStrategy,
  RecoveryResult,
  ErrorFixSuggestion,
} from "./errorRecovery";
