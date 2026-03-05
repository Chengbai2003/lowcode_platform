/**
 * AI 防幻觉校验相关类型定义
 */

/**
 * 校验错误类型
 */
export type ValidationErrorType =
  | "type" // 类型不匹配
  | "required" // 必填属性缺失
  | "format" // 格式错误
  | "constraint" // 约束违反
  | "reference" // 引用无效
  | "unknown" // 未知组件类型
  | "security"; // 安全风险

/**
 * 校验错误
 */
export interface ValidationError {
  path: string;
  message: string;
  type: ValidationErrorType;
  value?: unknown;
  suggestion?: string;
}

/**
 * 校验警告
 */
export interface ValidationWarning {
  path: string;
  message: string;
  type: "deprecated" | "performance" | "compatibility" | "best_practice";
  value?: unknown;
}

/**
 * 校验结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
  fixed?: boolean; // 是否自动修复
  fixes?: string[]; // 修复记录
  sanitizedData?: unknown; // 清理后的数据
}

/**
 * 校验选项
 */
export interface ValidationOptions {
  strict?: boolean; // 严格模式（不自动修复）
  allowUnknownTypes?: boolean; // 允许未知组件类型
  maxSchemaSize?: number; // Schema 最大大小（字节）
  maxComponents?: number; // 最大组件数量
  maxDepth?: number; // 最大嵌套深度
  allowedComponentTypes?: string[]; // 允许的组件类型白名单
  allowedProperties?: Record<string, string[]>; // 每个组件允许的属性
  sanitizeDangerousValues?: boolean; // 清理危险值
}

/**
 * AI 输出校验结果
 */
export interface AIOutputValidationResult extends ValidationResult {
  parseSuccess: boolean;
  originalContent?: string;
  extractedJSON?: string;
}

/**
 * 校验统计信息
 */
export interface ValidationStats {
  totalChecks: number;
  failedChecks: number;
  warnings: number;
  autoFixed: number;
  duration: number;
}

/**
 * 安全配置
 */
export interface AISafetyConfig {
  // 组件类型白名单
  allowedComponentTypes: string[];

  // 危险属性模式（正则表达式字符串）
  dangerousPropertyPatterns: string[];

  // 危险值模式
  dangerousValuePatterns: string[];

  // 允许的属性白名单（按组件类型）
  allowedProperties: Record<string, string[]>;

  // 必填属性（按组件类型）
  requiredProperties: Record<string, string[]>;

  // Schema 限制
  limits: {
    maxSchemaSize: number;
    maxComponents: number;
    maxDepth: number;
    maxPropsPerComponent: number;
    maxStringLength: number;
  };

  // 禁止的事件处理器模式
  blockedEventPatterns: string[];
}

/**
 * 校验上下文
 */
export interface ValidationContext {
  registeredComponents: string[];
  componentMetas: Map<string, ComponentPropertyMeta>;
  options: ValidationOptions;
}

/**
 * 组件属性元数据
 */
export interface ComponentPropertyMeta {
  type: string;
  properties: PropertyDefinition[];
}

/**
 * 属性定义
 */
export interface PropertyDefinition {
  key: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "expression";
  required?: boolean;
  defaultValue?: unknown;
  enum?: unknown[];
  pattern?: string;
  min?: number;
  max?: number;
}
