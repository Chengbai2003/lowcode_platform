/**
 * AST代码验证器
 * 用于验证用户提供的JS代码是否安全
 *
 * 注意：这是一个基础实现，生产环境建议使用更严格的方案
 * 如：Web Worker沙箱、QuickJS WASM等
 */

/**
 * 危险的模式列表（用于正则匹配）
 */
const DANGEROUS_PATTERNS = [
  // 动态代码执行
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\s*\(/,

  // 原生访问
  /\bwindow\s*\./,
  /\bdocument\s*\./,
  /\blocation\s*\./,
  /\bnavigator\s*\./,
  /\bhistory\s*\./,
  /\blocalStorage\s*\./,
  /\bsessionStorage\s*\./,
  /\bindexedDB\s*\./,

  // 危险的DOM操作
  /\bcreateElement\s*\(/,
  /\bwrite\s*\(/,
  /\bexecScript\s*\(/,
  /\bclearInterval\s*\(/,
  /\bclearTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bsetTimeout\s*\(/,

  // 危险的属性
  /\.__proto__/,
  /\.prototype\b/,
  /\.constructor\b/,
  /\.\s*constructor\s*\(/,

  // import/require（动态导入）
  /\bimport\s*\(/,
  /\brequire\s*\(/,

  // fetch/XMLHttpRequest（可能需要，看场景）
  // /\bfetch\s*\(/,
  // /\bXMLHttpRequest\b/,
];

/**
 * 允许的顶级语句类型（简化版）
 */
const ALLOWED_TOP_STATEMENTS = new Set([
  'ExpressionStatement',
  'ReturnStatement',
  'VariableDeclaration',
  'IfStatement',
  'BlockStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
  'ThrowStatement',
]);

/**
 * 简化的AST验证（基于正则）
 *
 * 注意：这只是一个基础的安全检查，不能保证100%安全
 * 生产环境应该：
 * 1. 使用Babel解析AST进行精确检查
 * 2. 在Web Worker或QuickJS中执行
 * 3. 限制执行时间和内存
 */
export function validateCodeSafety(code: string): boolean {
  if (typeof code !== 'string') {
    return false;
  }

  const trimmed = code.trim();

  // 空代码是安全的
  if (!trimmed) {
    return true;
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`Dangerous pattern detected: ${pattern}`);
      return false;
    }
  }

  // 检查括号平衡
  if (!checkBracketBalance(trimmed)) {
    console.warn('Unbalanced brackets detected');
    return false;
  }

  // 检查是否是简单的表达式
  if (isSimpleExpression(trimmed)) {
    return true;
  }

  // 如果代码包含复杂逻辑，记录警告
  if (trimmed.includes('function') || trimmed.includes('=>') || trimmed.includes('async')) {
    console.warn('Complex code detected. Consider using DSL actions instead.');
    // 这里可以根据策略决定是否允许
    // 目前允许，但应该有更严格的验证
  }

  return true;
}

/**
 * 检查括号是否平衡
 */
function checkBracketBalance(code: string): boolean {
  const brackets: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
  };

  const stack: string[] = [];
  const closeBrackets = new Set(Object.values(brackets));

  for (const char of code) {
    if (char in brackets) {
      stack.push(brackets[char]);
    } else if (closeBrackets.has(char)) {
      const expected = stack.pop();
      if (expected !== char) {
        return false;
      }
    }
  }

  return stack.length === 0;
}

/**
 * 判断是否是简单表达式
 */
function isSimpleExpression(code: string): boolean {
  const trimmed = code.trim();

  // 常量
  if (/^['"`].*['"`]$/.test(trimmed)) return true;  // 字符串
  if (/^-?\d+\.?\d*$/.test(trimmed)) return true;  // 数字
  if (/^(true|false|null|undefined)$/.test(trimmed)) return true;  // 布尔/null/undefined

  // 简单变量或属性访问（如 'data', 'formData.name'）
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(trimmed)) {
    return true;
  }

  // 简单的二元表达式（如 'a + b', 'data.count > 10'）
  const simpleBinaryPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\s*[\+\-\*\/%<>=!]=?\s*[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;
  if (simpleBinaryPattern.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * 提取代码中使用的变量名（简化版）
 */
export function extractVariables(code: string): string[] {
  const variables: string[] = [];

  // 简单的正则匹配（不完美但够用）
  const patterns = [
    // 对象属性访问：obj.prop
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\.[a-zA-Z_$][a-zA-Z0-9_$]*/g,
    // 简单变量名
    /(?<![a-zA-Z0-9_$])([a-zA-Z_$][a-zA-Z0-9_$]*)(?![a-zA-Z0-9_$])/g,
  ];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(code)) !== null) {
      const varName = match[1];

      // 过滤关键字
      const keywords = new Set([
        'true', 'false', 'null', 'undefined',
        'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
        'return', 'throw', 'try', 'catch', 'finally',
        'var', 'let', 'const', 'function', 'async', 'await',
        'new', 'this', 'typeof', 'instanceof', 'in', 'of',
        'class', 'extends', 'super', 'import', 'export', 'default',
        'delete', 'void', 'yield', 'debugger',
      ]);

      if (!keywords.has(varName) && !variables.includes(varName)) {
        variables.push(varName);
      }
    }
  }

  return variables;
}

/**
 * 深度AST验证（需要Babel，未实现）
 *
 * 如果需要更严格的验证，应该安装 @babel/parser 并实现此函数
 */
export function validateWithAST(code: string): { valid: boolean; errors: string[] } {
  // TODO: 实现
  return {
    valid: true,
    errors: [],
  };
}

/**
 * 导出
 */
export default {
  validateCodeSafety,
  extractVariables,
  validateWithAST,
};
