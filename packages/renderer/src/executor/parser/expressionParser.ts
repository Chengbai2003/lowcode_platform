/**
 * 表达式解析器
 * 支持解析和执行 {{ }} 语法表达式
 */

import type { ParsedExpression } from "@lowcode-platform/types";

/**
 * 表达式正则表达式
 * 匹配 {{ expression }} 格式
 */
const EXPRESSION_REGEX = /\{\{([^{}]+)\}\}/g;

/**
 * 判断是否是表达式字符串
 */
function isExpressionString(str: string): boolean {
  // 重置正则匹配状态
  EXPRESSION_REGEX.lastIndex = 0;
  return EXPRESSION_REGEX.test(str);
}

/**
 * 判断是否是变量引用（简单变量名）
 */
function isSimpleVariable(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str.trim());
}

/**
 * 判断是否是模板字符串（包含表达式和文本混合）
 */
function isTemplateString(str: string): boolean {
  const matches = str.match(EXPRESSION_REGEX);
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
      type: "literal",
      raw: str,
      value: parseLiteral(str), // 传递原始字符串而不是trim后的
    };
  }

  // 情况2：模板字符串（如 "Hello {{name}}, age is {{age}}"）
  if (isTemplateString(trimmed)) {
    const variables: string[] = [];
    let match;
    EXPRESSION_REGEX.lastIndex = 0; // Reset before exec loop
    while ((match = EXPRESSION_REGEX.exec(trimmed)) !== null) {
      const expr = match[1].trim();
      // 提取变量名（简化处理，实际应该用AST）
      if (isSimpleVariable(expr)) {
        variables.push(expr);
      }
    }
    return {
      type: "template",
      raw: str,
      variables,
    };
  }

  // 情况3：变量引用（如 "{{name}}"）
  const exprMatch = trimmed.match(/^\{\{([^{}]+)\}\}$/);
  if (exprMatch) {
    const expr = exprMatch[1].trim();

    if (isSimpleVariable(expr)) {
      return {
        type: "variable",
        raw: str,
        variables: [expr],
      };
    }

    // 情况4：复杂表达式（如 "{{formData.age > 18}}"）
    return {
      type: "complex",
      raw: str,
      expression: expr,
      variables: extractVariables(expr),
    };
  }

  return {
    type: "literal",
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
      if (
        ![
          "true",
          "false",
          "null",
          "undefined",
          "if",
          "else",
          "for",
          "while",
        ].includes(varName) &&
        !variables.includes(varName)
      ) {
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
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // null和undefined
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;

  // JSON对象/数组
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
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
export function evaluateExpression(
  expr: ParsedExpression,
  context: Record<string, any>,
): any {
  switch (expr.type) {
    case "literal":
      return expr.value;

    case "variable":
      if (expr.variables && expr.variables.length > 0) {
        const varName = expr.variables[0];
        return getNestedValue(context, varName);
      }
      return undefined;

    case "complex":
      if (expr.expression) {
        return executeComplexExpression(expr.expression, context);
      }
      return undefined;

    case "template":
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
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * 创建沙箱环境
 */
function createSandbox(context: Record<string, any>): any {
  // 安全的全局对象白名单
  const safeGlobals: Record<string, any> = {
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    console, // 允许console用于调试
  };

  // 合并上下文和安全全局对象
  const sandboxContext = { ...safeGlobals, ...context };

  // 使用Proxy拦截属性访问
  return new Proxy(sandboxContext, {
    has(target, key: string | symbol) {
      // 拦截所有属性访问，强制在沙箱内查找
      // 返回true意味着"这个属性在target中存在"（即使实际上不存在）
      // 这会迫使 `with` 语句在 target 中查找该属性，而不是向上查找全局作用域
      return true;
    },
    get(target, key: string | symbol, receiver) {
      // 阻止访问 constructor (防止通过 ({}).constructor 访问 Function)
      if (key === "constructor") {
        return undefined;
      }

      // 阻止访问 __proto__ 等
      if (key === "__proto__" || key === "prototype") {
        return undefined;
      }

      // 优先从上下文中获取
      if (key in target) {
        return Reflect.get(target, key, receiver);
      }

      // 如果 key 是 symbol，允许访问（如 Symbol.iterator）
      if (typeof key === "symbol") {
        // 这里需要小心，某些 symbol 可能会导致问题，但通常是安全的
        // 为了简单起见，且避免 Symbol.unscopables 等问题，我们可以放行
        return Reflect.get(target, key, receiver);
      }

      // 剩下的就是未定义的变量。
      // 在沙箱中，访问未定义的变量应该返回 undefined 或者报错，而不是回退到全局对象
      // 因为 has() 返回 true，所以 JS 引擎会认为变量在 scope 中。
      // 然后 get() 被调用。如果我们返回 undefined，那就相当于变量值为 undefined。
      // 这防止了访问 window, document 等。
      return undefined;
    },
  });
}

/**
 * 校验表达式安全性
 * 静态分析代码，拦截潜在的危险操作
 */
function validateSafety(code: string): boolean {
  // 禁止访问构造函数、原型链
  const dangerousKeywords = [
    "constructor",
    "__proto__",
    "prototype",
    "Function",
    "eval",
    "setTimeout",
    "setInterval",
    "import",
    "window",
    "document",
    "globalThis",
  ];

  for (const keyword of dangerousKeywords) {
    if (code.includes(keyword)) {
      return false;
    }
  }

  return true;
}

/**
 * 执行复杂表达式（使用 Proxy 沙箱 + with 语句）
 */
function executeComplexExpression(
  expr: string,
  context: Record<string, any>,
): any {
  try {
    // 1. 静态安全检查
    // 这是为了弥补 with(proxy) 无法拦截字面量属性访问的缺陷
    // 例如：{{ [].constructor }}
    if (!validateSafety(expr)) {
      // console.warn('Expression blocked by safety check:', expr);
      return undefined;
    }

    // 创建沙箱
    const sandbox = createSandbox(context);

    // ... (rest of the function)

    // 使用 with 语句限制作用域
    // 注意：这里我们仍然使用了 new Function，但是包裹在 with(sandbox) 中
    // 并且 sandbox 的 Proxy 强制拦截了所有查找
    //
    // 实现原理：
    // with(sandbox) { return (expression); }
    // 当 expression 访问 'window' 时：
    // 1. with 检查 'window' in sandbox -> Proxy.has('window') -> true
    // 2. 读取 sandbox.window -> Proxy.get('window') -> undefined
    //
    // 从而屏蔽了全局对象

    // 移除潜在的特定危险关键字（可选，作为深度防御）
    // 但主要依赖 Proxy

    // 构建函数体
    // "sandbox" 是参数名
    const fn = new Function("sandbox", `with(sandbox) { return (${expr}); }`);

    return fn(sandbox);
  } catch (error) {
    // console.warn(`Failed to evaluate expression: ${expr}`, error);
    return undefined;
  }
}

/**
 * 插值模板字符串
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, any>,
): string {
  // replace all occurrences
  return template.replace(EXPRESSION_REGEX, (match, expr) => {
    const trimmed = expr.trim();
    const parsed = parseExpression(`{{${trimmed}}}`);
    const value = evaluateExpression(parsed, context);

    // 处理undefined和null
    if (value === undefined || value === null) {
      return "";
    }

    // 处理对象和数组
    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * 快捷方法：直接解析并执行表达式
 */
export function parseAndEvaluate(
  str: any,
  context: { [key: string]: any },
): any {
  // 非字符串直接返回
  if (typeof str !== "string") {
    return str;
  }

  const parsed = parseExpression(str);
  return evaluateExpression(parsed, context);
}

/**
 * 判断是否是表达式
 */
export function isExpression(value: any): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  // 纯表达式格式：{{expression}}
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    EXPRESSION_REGEX.lastIndex = 0;
    return EXPRESSION_REGEX.test(trimmed);
  }
  // 包含表达式的模板字符串：text {{expression}} more text
  EXPRESSION_REGEX.lastIndex = 0;
  return EXPRESSION_REGEX.test(trimmed);
}
