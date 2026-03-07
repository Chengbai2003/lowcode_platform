/**
 * 表达式类型
 */
export type ExpressionType = "literal" | "variable" | "template" | "complex";

/**
 * 解析后的表达式
 */
export interface ParsedExpression {
  type: ExpressionType;
  raw: string;
  value?: any;
  variables?: string[];
  expression?: string;
}
