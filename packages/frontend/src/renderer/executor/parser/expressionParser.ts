/**
 * 表达式解析器
 * 支持解析和执行 {{ }} 语法表达式
 */

import type { ParsedExpression } from '../../../types';
import { safeEvaluate, SAFE_GLOBALS } from './safeEvaluator';
import { getFlag } from '../../featureFlags';

const VALID_ALIAS_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const RESERVED_IDENTIFIERS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'if',
  'else',
  'for',
  'while',
  'return',
  'switch',
  'case',
  'default',
  'typeof',
  'new',
  'this',
  'class',
  'extends',
  'let',
  'const',
  'var',
  'function',
  'import',
  'export',
  'void',
  'delete',
  'in',
  'instanceof',
  ...Object.keys(SAFE_GLOBALS),
]);
const RESERVED_CONTEXT_KEYS = new Set([
  ...RESERVED_IDENTIFIERS,
  'data',
  'formData',
  'state',
  'route',
  'user',
  'ui',
  'api',
  'utils',
  'navigate',
  'back',
  'event',
  'dispatch',
  'getState',
  'components',
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * 表达式正则表达式
 * 匹配 {{ expression }} 格式
 * 更改为工厂函数防止被意外污染 lastIndex 状态导致漏匹配
 */
const getExpressionRegex = () => /\{\{([\s\S]+?)\}\}/g;

/**
 * 判断是否是表达式字符串
 */
function isExpressionString(str: string): boolean {
  return getExpressionRegex().test(str);
}

/**
 * 判断是否是变量引用（简单变量名）
 */
function isSimpleVariable(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str.trim());
}

function isReservedLiteral(str: string): boolean {
  const trimmed = str.trim();
  return trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || trimmed === 'undefined';
}

function isValidAliasKey(key: string, context: Record<string, any>): boolean {
  if (!VALID_ALIAS_REGEX.test(key)) return false;
  if (RESERVED_CONTEXT_KEYS.has(key)) return false;
  if (key in Object.prototype) return false;
  if (Object.prototype.hasOwnProperty.call(context, key)) return false;
  return true;
}

export function buildExpressionContext(context: Record<string, any> = {}): Record<string, any> {
  if (!context || typeof context !== 'object') {
    return {};
  }

  const data = (context as Record<string, any>).data;

  if (!data || typeof data !== 'object') {
    return { ...context };
  }

  // Phase 2: Proxy 惰性别名，按需读取而非全量展开
  if (getFlag('selectiveEvaluation')) {
    return new Proxy(context, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (typeof key === 'string' && isValidAliasKey(key, target) && key in data) {
          return data[key];
        }
        return undefined;
      },
      has(target, key: string) {
        if (key in target) return true;
        return typeof key === 'string' && isValidAliasKey(key, target) && key in data;
      },
    });
  }

  // 默认路径：全量展开（向后兼容）
  const resolvedContext: Record<string, any> = { ...context };
  for (const [key, value] of Object.entries(data)) {
    if (!isValidAliasKey(key, resolvedContext)) continue;
    resolvedContext[key] = value;
  }
  return resolvedContext;
}

/**
 * 判断是否是模板字符串（包含表达式和文本混合）
 */
function isTemplateString(str: string): boolean {
  const matches = str.match(getExpressionRegex());
  if (!matches) return false;
  // 如果有多个表达式，则是模板字符串
  if (matches.length > 1) return true;

  const trimmed = str.trim();
  // 如果表达式前后有文本，则是模板字符串
  const firstMatch = matches[0];
  const lastMatch = matches[matches.length - 1];
  return (
    trimmed.indexOf(firstMatch) > 0 ||
    trimmed.lastIndexOf(lastMatch) < trimmed.length - lastMatch.length
  );
}

/**
 * 解析表达式字符串，返回解析结果
 */
export function parseExpression(str: string): ParsedExpression {
  const trimmed = str.trim();

  // 情况1：字面量（不是表达式）
  if (!isExpressionString(trimmed)) {
    return {
      type: 'literal',
      raw: str,
      value: parseLiteral(str), // 传递原始字符串而不是trim后的
    };
  }

  // 情况2：模板字符串（如 "Hello {{name}}, age is {{age}}"）
  if (isTemplateString(trimmed)) {
    const variables: string[] = [];
    let match;
    const regex = getExpressionRegex();
    while ((match = regex.exec(trimmed)) !== null) {
      const expr = match[1].trim();
      // 提取变量名（简化处理，实际应该用AST）
      if (isSimpleVariable(expr)) {
        variables.push(expr);
      }
    }
    return {
      type: 'template',
      raw: str,
      variables,
    };
  }

  // 情况3：变量引用（如 "{{name}}"）
  const exprMatch = trimmed.match(/^\{\{([\s\S]+?)\}\}$/);
  if (exprMatch) {
    const expr = exprMatch[1].trim();

    if (isReservedLiteral(expr)) {
      return {
        type: 'literal',
        raw: str,
        value: parseLiteral(expr),
      };
    }

    if (isSimpleVariable(expr)) {
      return {
        type: 'variable',
        raw: str,
        variables: [expr],
      };
    }

    // 情况4：复杂表达式（如 "{{formData.age > 18}}"）
    return {
      type: 'complex',
      raw: str,
      expression: expr,
      variables: extractVariables(expr),
    };
  }

  return {
    type: 'literal',
    raw: str,
    value: str,
  };
}

/**
 * 从表达式中提取变量名（简化版本）
 * 实际项目中应该使用AST来准确提取
 */
function extractVariables(expr: string): string[] {
  const variables: string[] = [];
  const patterns = [
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, // 对象属性访问
    /([a-zA-Z_$][a-zA-Z0-9_$]*)/g, // 简单变量名
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(expr)) !== null) {
      const varName = match[1];
      // 过滤掉关键字和已存在的变量
      if (!RESERVED_IDENTIFIERS.has(varName) && !variables.includes(varName)) {
        variables.push(varName);
      }
    }
  }

  return variables;
}

/**
 * 解析字面量
 */
function parseLiteral(str: string): any {
  const trimmed = str.trim();

  // 空字符串直接返回
  if (!trimmed) {
    return str; // 保留原空格
  }

  // 数字（包括科学计数法）
  if (/^-?\d+\.?\d*(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 布尔值
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // null和undefined
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;

  // JSON对象/数组
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // 解析失败，返回原字符串
    }
  }

  // 字符串（去掉引号）
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return str; // 返回原字符串
}

/**
 * 执行表达式
 */
export function evaluateExpression(expr: ParsedExpression, context: Record<string, any>): any {
  switch (expr.type) {
    case 'literal':
      return expr.value;

    case 'variable':
      if (expr.variables && expr.variables.length > 0) {
        const varName = expr.variables[0];
        return getNestedValue(context, varName);
      }
      return undefined;

    case 'complex':
      if (expr.expression) {
        return executeComplexExpression(expr.expression, context);
      }
      return undefined;

    case 'template':
      if (expr.raw) {
        return interpolateTemplate(expr.raw, context);
      }
      return undefined;

    default:
      return undefined;
  }
}

/**
 * 获取嵌套对象的值（如 "formData.user.name"）
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * 执行复杂表达式（新版：使用 jsep AST + 白名单沙箱求值）
 */
function executeComplexExpression(expr: string, context: Record<string, any>): any {
  try {
    return safeEvaluate(expr, context);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[SafeEvaluator] Failed: ${expr}`, error);
    }
    return undefined;
  }
}

/**
 * 插值模板字符串
 */
export function interpolateTemplate(template: string, context: Record<string, any>): string {
  const resolvedContext = buildExpressionContext(context);
  // replace all occurrences
  return template.replace(getExpressionRegex(), (_match, expr) => {
    const trimmed = expr.trim();
    const parsed = parseExpression(`{{${trimmed}}}`);
    const value = evaluateExpression(parsed, resolvedContext);

    // 处理undefined和null
    if (value === undefined || value === null) {
      return '';
    }

    // 处理对象和数组
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * 快捷方法：直接解析并执行表达式
 * 如果 context 包含 runtime，则使用 tracking proxy 进行依赖收集
 */
export function parseAndEvaluate(str: any, context: { [key: string]: any; runtime?: any }): any {
  // 非字符串直接返回
  if (typeof str !== 'string') {
    return str;
  }

  const parsed = parseExpression(str);

  // 如果 runtime 存在，使用 tracking proxy 进行依赖收集
  if (context.runtime && typeof context.runtime.createTrackingProxy === 'function') {
    // 启动追踪
    context.runtime.startTracking();
    try {
      const trackingProxy = context.runtime.createTrackingProxy();
      // 使用 tracking proxy 作为 context 进行求值
      const result = evaluateExpression(parsed, buildExpressionContextWithProxy(trackingProxy));
      // 停止追踪（依赖已收集到 runtime 内部）
      context.runtime.stopTracking();
      return result;
    } catch (error) {
      // 确保即使出错也停止追踪
      context.runtime.stopTracking();
      throw error;
    }
  }

  return evaluateExpression(parsed, buildExpressionContext(context));
}

/**
 * 为 tracking proxy 构建表达式上下文
 * 直接使用 proxy 作为数据源，而不是全量展开
 */
function buildExpressionContextWithProxy(proxy: Record<string, any>): Record<string, any> {
  // Phase 2: Proxy 惰性别名，按需读取
  if (getFlag('selectiveEvaluation')) {
    return new Proxy(proxy, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (typeof key === 'string' && isValidAliasKey(key, target) && key in (target.data || {})) {
          return (target.data as Record<string, any>)[key];
        }
        return undefined;
      },
      has(target, key: string) {
        if (key in target) return true;
        return (
          typeof key === 'string' && isValidAliasKey(key, target) && key in (target.data || {})
        );
      },
    });
  }

  // 默认路径：全量展开（向后兼容）
  const resolvedContext: Record<string, any> = { ...proxy };
  const data = (proxy.data as Record<string, any>) || {};
  for (const [key, value] of Object.entries(data)) {
    if (!isValidAliasKey(key, resolvedContext)) continue;
    resolvedContext[key] = value;
  }
  return resolvedContext;
}

/**
 * 判断是否是表达式
 */
export function isExpression(value: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  // 纯表达式格式：{{expression}}
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return getExpressionRegex().test(trimmed);
  }
  // 包含表达式的模板字符串：text {{expression}} more text
  return getExpressionRegex().test(trimmed);
}
