/**
 * 表达式解析器模块
 */

export {
  parseExpression,
  evaluateExpression,
  interpolateTemplate,
  parseAndEvaluate,
  isExpression,
} from './expressionParser';

export {
  resolveValue,
  resolveValues,
  resolveArray,
  getValueType,
  safeGet,
  safeSet,
  deepMerge,
} from './valueResolver';

export type {
  ParsedExpression,
  ExpressionType,
} from '../../types/dsl';
