/**
 * 表达式依赖静态分析器
 * 分析组件 props 中的表达式依赖，用于选择性求值优化
 */

import { parseExpression } from '../executor/parser/expressionParser';
import type { A2UIComponent } from '../../types';

export interface ComponentDeps {
  /** 该组件的表达式依赖了哪些 data key */
  dataDeps: Set<string>;
  /** 是否包含无法静态分析的动态表达式 */
  hasDynamicDeps: boolean;
}

const DATA_DOT_PATTERN = /data\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
const DATA_BRACKET_PATTERN = /data\[['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]\]/g;

/**
 * 从原始表达式字符串中提取 data.X 和 data['X'] 引用
 */
function extractDataKeysFromExpression(raw: string, target: Set<string>): void {
  let match;
  DATA_DOT_PATTERN.lastIndex = 0;
  while ((match = DATA_DOT_PATTERN.exec(raw)) !== null) {
    target.add(match[1]);
  }
  DATA_BRACKET_PATTERN.lastIndex = 0;
  while ((match = DATA_BRACKET_PATTERN.exec(raw)) !== null) {
    target.add(match[1]);
  }
}

/**
 * 从 variables 列表中提取 data key
 * 例如 ['data', 'formData'] 中 data 表示依赖整个 data 对象
 * 例如表达式 {{ data.B === 'show' }} 的 variables 为 ['data']
 * 但我们需要更精确地从原始表达式中提取 data.X 的 X
 */
function extractDataKeysFromVariables(variables: string[], rawExpression: string): Set<string> {
  const keys = new Set<string>();

  for (const v of variables) {
    if (v === 'data') {
      extractDataKeysFromExpression(rawExpression, keys);
    } else {
      // 顶层别名（如 {{ inputB }}），这些是 data 中的 key 别名
      // 排除已知的 context key
      if (!isKnownContextKey(v)) {
        keys.add(v);
      }
    }
  }

  return keys;
}

const KNOWN_CONTEXT_KEYS = new Set([
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
]);

function isKnownContextKey(key: string): boolean {
  return KNOWN_CONTEXT_KEYS.has(key);
}

/**
 * 递归扫描值中的所有表达式字符串
 */
function collectExpressionStrings(value: any, results: string[]): void {
  if (typeof value === 'string') {
    if (value.includes('{{')) {
      results.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectExpressionStrings(item, results);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      collectExpressionStrings(v, results);
    }
  }
}

/**
 * 分析组件 props 中所有表达式的依赖
 */
export function analyzeComponentDeps(props: Record<string, any>): ComponentDeps {
  const dataDeps = new Set<string>();
  let hasDynamicDeps = false;

  const expressionStrings: string[] = [];
  collectExpressionStrings(props, expressionStrings);

  for (const exprStr of expressionStrings) {
    const parsed = parseExpression(exprStr);

    if (parsed.type === 'literal') continue;

    const variables = parsed.variables ?? [];

    if (parsed.type === 'complex' && parsed.expression) {
      // 检查是否有动态属性访问（如 data[someVar]）
      if (/data\[[^'"]/.test(parsed.expression)) {
        hasDynamicDeps = true;
      }
      const keys = extractDataKeysFromVariables(variables, parsed.expression);
      for (const k of keys) dataDeps.add(k);
    } else if (parsed.type === 'variable' && variables.length > 0) {
      // 简单变量引用，如 {{ inputB }}
      const keys = extractDataKeysFromVariables(variables, exprStr);
      for (const k of keys) dataDeps.add(k);
    } else if (parsed.type === 'template') {
      // 模板字符串：variables 只包含简单变量名，
      // 但表达式中可能有 data.X 形式，需要从原始字符串中提取
      const keys = extractDataKeysFromVariables(variables, exprStr);
      for (const k of keys) dataDeps.add(k);
      // 补充：从原始字符串中直接提取 data.X 引用
      extractDataKeysFromExpression(exprStr, dataDeps);
    }
  }

  return { dataDeps, hasDynamicDeps };
}

/**
 * 分析整个 schema 的依赖图
 */
export function analyzeSchemaDepGraph(
  components: Record<string, A2UIComponent>,
): Map<string, ComponentDeps> {
  const depGraph = new Map<string, ComponentDeps>();

  for (const [compId, comp] of Object.entries(components)) {
    if (comp.props) {
      depGraph.set(compId, analyzeComponentDeps(comp.props as Record<string, any>));
    }
  }

  return depGraph;
}

/**
 * 判断两个 Set 是否有交集
 */
export function setsOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) return true;
  }
  return false;
}
