/**
 * 表达式解析器
 * 支持解析和执行 {{ }} 语法表达式
 */

import type { ParsedExpression } from '../../dsl';
import { safeEvaluate, SAFE_GLOBALS } from './safeEvaluator';
import { getFlag } from '../../featureFlags';
import { cloneSanitizedSafe, fallbackCloneSafe } from '../../utils/safeClone';

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
  'computed',
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
  'runtime',
  '__proto__',
  'constructor',
  'prototype',
]);

// ——— P0-2: 输入净化（via shared safeClone, descriptor-safe） ———
const hasOwnEp = (t: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(t, k);
const SANITIZE_SKIP_EP = Symbol('sanitize-skip-ep');
function cloneSanitizedEp(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  return cloneSanitizedSafe(value, seen, SANITIZE_SKIP_EP);
}
function sanitizeContextEp(context: Record<string, any> | undefined): Record<string, any> {
  if (!context || typeof context !== 'object') return {};
  const cloned = cloneSanitizedEp(context) as Record<string, any>;
  return (cloned as Record<string, any>) ?? {};
}

const ALLOWED_EXPRESSION_KEYS = [
  'data',
  'state',
  'computed',
  'formData',
  'user',
  'route',
  'components',
] as const;
// 行上下文/循环变量等合法扩展键（Table record/value、loop item/index 等），不在真白名单核心但需放行以支撑模板；仍受 RESERVED_CONTEXT_KEYS / isValidAliasKey 阻断
const ALLOWED_EXTENSION_KEYS = [
  'record',
  'value',
  'rowIndex',
  'item',
  'index',
  'componentId',
  'event',
  'row',
  'response',
  'error',
  'input',
] as const;
const PURE_UTILS_KEYS = ['formatDate', 'uuid', 'clone'] as const;

// ——— P0-3: 内部纯净 utils（via shared safeClone） ———
function fallbackClonePure<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  return fallbackCloneSafe(value, seen);
}
const pureFormatDate = (date: Date | string, _format = 'YYYY-MM-DD'): string => {
  return String(date);
};
const pureUuid = (): string => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const pureClone = <T>(obj: T): T => fallbackClonePure(obj);
const INTERNAL_PURE_UTILS: Record<string, unknown> = {
  formatDate: pureFormatDate,
  uuid: pureUuid,
  clone: pureClone,
};

// 真白名单：核心命名空间 + 合法扩展键（record/item/index 等），其余自定义顶层字段不暴露，数据别名另由 buildExpressionContext 处理 — own-only (P1-high #3)
function pickAllowedContext(context: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = Object.create(null);
  for (const k of ALLOWED_EXPRESSION_KEYS) {
    if (hasOwnEp(context, k)) out[k] = (context as Record<string, any>)[k];
  }
  for (const k of ALLOWED_EXTENSION_KEYS) {
    if (hasOwnEp(context, k)) out[k] = (context as Record<string, any>)[k];
  }
  // 兼容任意合法循环变量：isValidAliasKey 且非保留键，已存在于 sanitized context 的额外键（如自定义 itemVar）
  for (const [k, v] of Object.entries(context)) {
    if ((ALLOWED_EXPRESSION_KEYS as readonly string[]).includes(k)) continue;
    if ((ALLOWED_EXTENSION_KEYS as readonly string[]).includes(k)) continue;
    if (k === 'utils') continue;
    if (!isValidAliasKey(k, out)) continue;
    // 仅放行已存在于 sanitized context 的额外键，且其值非敏感对象（已在 sanitize 阶段去函数/getter）
    out[k] = v;
  }
  // 只暴露内建纯净 utils，不接受 context 覆盖（P0-3）
  const filtered: Record<string, any> = {};
  for (const kk of PURE_UTILS_KEYS) {
    const fn = (INTERNAL_PURE_UTILS as Record<string, any>)[kk];
    if (typeof fn === 'function') filtered[kk] = fn;
  }
  if (Object.keys(filtered).length > 0) out.utils = filtered;
  return out;
}

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
  if (hasOwnEp(Object.prototype, key)) return false;
  if (hasOwnEp(context, key)) return false;
  return true;
}

export function buildExpressionContext(context: Record<string, any> = {}): Record<string, any> {
  const sanitized = sanitizeContextEp(context);
  if (!sanitized || typeof sanitized !== 'object') {
    return {};
  }

  const data = (sanitized as Record<string, any>).data;
  const allowedBase = pickAllowedContext(sanitized);

  if (!data || typeof data !== 'object') {
    return allowedBase;
  }

  // Proxy 惰性别名，按需读取而非全量展开；补 ownKeys/getOwnPropertyDescriptor 使 Object.keys / sanitize 能捕获别名 — own-only
  if (getFlag('selectiveEvaluation')) {
    const aliasKeys = () =>
      Object.keys(data as Record<string, unknown>).filter(
        (k) => isValidAliasKey(k, allowedBase) && !hasOwnEp(allowedBase, k),
      );
    return new Proxy(allowedBase, {
      get(target, key: string) {
        if (hasOwnEp(target, key)) return (target as Record<string, any>)[key];
        if (
          typeof key === 'string' &&
          isValidAliasKey(key, target) &&
          hasOwnEp(data as object, key)
        ) {
          return (data as Record<string, any>)[key];
        }
        return undefined;
      },
      has(target, key: string) {
        if (hasOwnEp(target, key)) return true;
        return (
          typeof key === 'string' && isValidAliasKey(key, target) && hasOwnEp(data as object, key)
        );
      },
      ownKeys(target) {
        return [...Reflect.ownKeys(target), ...aliasKeys()];
      },
      getOwnPropertyDescriptor(target, key) {
        if (hasOwnEp(target, key as string)) {
          return Reflect.getOwnPropertyDescriptor(target, key);
        }
        if (typeof key === 'string' && aliasKeys().includes(key)) {
          return {
            value: (data as Record<string, unknown>)[key],
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      },
    });
  }

  // 默认路径：全量展开（向后兼容）
  const resolvedContext: Record<string, any> = { ...allowedBase };
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
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
    const ownsTracking =
      typeof context.runtime.isTrackingActive === 'function'
        ? !context.runtime.isTrackingActive()
        : true;

    if (ownsTracking && typeof context.runtime.startTracking === 'function') {
      context.runtime.startTracking();
    }

    try {
      const trackingProxy = context.runtime.createTrackingProxy();
      // 使用 tracking proxy 作为 runtime 命名空间，并保留额外上下文键。
      const result = evaluateExpression(
        parsed,
        buildExpressionContextWithProxy(trackingProxy, context),
      );
      // 仅在当前表达式拥有 tracking 生命周期时收尾
      if (ownsTracking && typeof context.runtime.stopTracking === 'function') {
        context.runtime.stopTracking();
      }
      return result;
    } catch (error) {
      // 确保即使出错也停止追踪
      if (ownsTracking && typeof context.runtime.stopTracking === 'function') {
        context.runtime.stopTracking();
      }
      throw error;
    }
  }

  return evaluateExpression(parsed, buildExpressionContext(context));
}

/**
 * 为 tracking proxy 构建表达式上下文
 * 直接使用 proxy 作为数据源，而不是全量展开
 */
function buildExpressionContextWithProxy(
  proxy: Record<string, any>,
  context: Record<string, any> = {},
): Record<string, any> {
  const sanitized = sanitizeContextEp(context);
  const allowed = pickAllowedContext(sanitized);
  const baseContext: Record<string, any> = {
    ...allowed,
    data: proxy.data,
    state: proxy.state,
    computed: proxy.computed,
    formData: proxy.formData,
    components: proxy.components,
  };

  // Proxy 惰性别名，按需读取；ownKeys 使 sanitizer 能捕获别名 — own-only
  if (getFlag('selectiveEvaluation')) {
    const aliasKeysWithProxy = (target: Record<string, any>) => {
      const d = (target.data || {}) as Record<string, unknown>;
      if (!d || typeof d !== 'object') return [] as string[];
      return Object.keys(d).filter((k) => isValidAliasKey(k, target) && !hasOwnEp(target, k));
    };
    return new Proxy(baseContext, {
      get(target, key: string) {
        if (hasOwnEp(target, key)) return target[key];
        if (
          typeof key === 'string' &&
          isValidAliasKey(key, target) &&
          hasOwnEp((target.data || {}) as object, key)
        ) {
          return (target.data as Record<string, any>)[key];
        }
        return undefined;
      },
      has(target, key: string) {
        if (hasOwnEp(target, key)) return true;
        return (
          typeof key === 'string' &&
          isValidAliasKey(key, target) &&
          hasOwnEp((target.data || {}) as object, key)
        );
      },
      ownKeys(target) {
        return [...Reflect.ownKeys(target), ...aliasKeysWithProxy(target)];
      },
      getOwnPropertyDescriptor(target, key) {
        if (hasOwnEp(target, key as string)) return Reflect.getOwnPropertyDescriptor(target, key);
        if (typeof key === 'string' && aliasKeysWithProxy(target).includes(key)) {
          return {
            value: (target.data as Record<string, unknown>)[key],
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      },
    });
  }

  // 默认路径：全量展开（向后兼容）
  const resolvedContext: Record<string, any> = { ...baseContext };
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
