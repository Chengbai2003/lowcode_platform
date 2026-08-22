import jsep from 'jsep';
import jsepNew from '@jsep-plugin/new';
import { pauseTracking, resumeTracking, isTrackingProxy } from '../../reactive/tracking';

jsep.plugins.register(jsepNew);
// jsep 默认不将 typeof 视作一元运算符，需要手动注册
jsep.addUnaryOp('typeof');

// 白名单：允许在表达式中使用的全局对象与方法
export const SAFE_GLOBALS: Record<string, any> = {
  Math,
  JSON,
  Date,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  undefined,
  null: null,
  true: true,
  false: false,
};

const BLOCKED_MEMBER_PROPS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'toJSON',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

const BLOCKED_CALL_METHODS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'assign',
  'defineProperty',
  'setPrototypeOf',
  'freeze',
  'seal',
  'preventExtensions',
  'toJSON',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

// ——— P0-2: intrinsic 白名单（只允许原生原型方法且未被自有属性覆盖） ———
const STRING_SAFE = new Set([
  'slice',
  'substring',
  'split',
  'includes',
  'startsWith',
  'endsWith',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimStart',
  'trimEnd',
  'indexOf',
  'lastIndexOf',
  'charAt',
  'charCodeAt',
  'replace',
  'replaceAll',
  'toString',
  'valueOf',
]);
const ARRAY_SAFE = new Set([
  'slice',
  'concat',
  'includes',
  'indexOf',
  'lastIndexOf',
  'join',
  'at',
  'flat',
]);
const NUMBER_SAFE = new Set(['toString', 'toFixed', 'toPrecision', 'toExponential', 'valueOf']);
const MATH_SAFE = new Set([
  'abs',
  'ceil',
  'floor',
  'round',
  'max',
  'min',
  'pow',
  'sqrt',
  'trunc',
  'sign',
  'random',
]);
const JSON_SAFE = new Set(['stringify', 'parse']);

const ARRAY_MUTATOR_BLOCK = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);
const ARRAY_CALLBACK_BLOCK = new Set([
  'map',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'flatMap',
  'forEach',
  'sort',
]);
const STRING_BLOCK = new Set(['match', 'search', 'matchAll', 'repeat', 'padStart', 'padEnd']);

// ——— P0-2: 输入净化 ———
// 只保留 plain object / array / primitive / Date 深拷贝，跳过 getter/setter、函数、类实例
const SANITIZE_SKIP = Symbol('sanitize-skip');
function isPlainObject(o: unknown): boolean {
  if (o === null || typeof o !== 'object') return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}
function cloneSanitized(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      return SANITIZE_SKIP;
    return value;
  }
  // 保留追踪代理以维持依赖收集（P0-2 收尾）
  if (isTrackingProxy(value)) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value as object)) return seen.get(value as object);
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(value as object, arr);
    for (let i = 0; i < (value as unknown[]).length; i++) {
      const desc = Object.getOwnPropertyDescriptor(value, String(i));
      if (desc && (desc.get || desc.set)) {
        arr[i] = undefined;
        continue;
      }
      const raw = (value as unknown[])[i];
      if (typeof raw === 'function' || typeof raw === 'symbol') {
        arr[i] = undefined;
        continue;
      }
      const cloned = cloneSanitized(raw, seen);
      arr[i] = cloned === SANITIZE_SKIP ? undefined : cloned;
    }
    return arr;
  }
  if (!isPlainObject(value)) return SANITIZE_SKIP;
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const desc = Object.getOwnPropertyDescriptor(value as Record<string, unknown>, key);
    if (!desc) continue;
    if (desc.get || desc.set) continue;
    const raw = desc.value;
    if (typeof raw === 'function' || typeof raw === 'symbol') continue;
    const cloned = cloneSanitized(raw, seen);
    if (cloned === SANITIZE_SKIP) continue;
    out[key] = cloned;
  }
  return out;
}
function sanitizeContext(context: Record<string, any> | undefined): Record<string, any> {
  if (!context || typeof context !== 'object') return {};
  const cloned = cloneSanitized(context) as Record<string, any>;
  return (cloned as Record<string, any>) ?? {};
}

/**
 * 安全计算 AST 节点
 */
function evaluateNode(node: jsep.Expression, context: Record<string, any>): any {
  if (!node) return undefined;

  switch (node.type) {
    case 'Literal': {
      return (node as jsep.Literal).value;
    }

    case 'Identifier': {
      const name = (node as jsep.Identifier).name;
      // 优先从上下文获取，其次是从白名单全局对象获取
      if (context && typeof context === 'object' && name in context) {
        return context[name];
      }
      if (name in SAFE_GLOBALS) {
        return SAFE_GLOBALS[name];
      }
      return undefined;
    }

    case 'MemberExpression': {
      const memberNode = node as jsep.MemberExpression;
      const obj = evaluateNode(memberNode.object, context);

      if (obj === undefined || obj === null) {
        return undefined; // 防止 Cannot read properties of undefined
      }

      let propertyName: string | number;
      if (memberNode.computed) {
        // [表达式] 访问，如 items[0] 或是 items[i]
        propertyName = evaluateNode(memberNode.property, context);
      } else {
        // .属性 访问，如 user.name
        propertyName = (memberNode.property as jsep.Identifier).name;
      }

      // 安全检查：阻止访问原型链、构造函数及危险方法
      if (typeof propertyName === 'string' && BLOCKED_MEMBER_PROPS.has(propertyName)) {
        return undefined;
      }

      return obj[propertyName];
    }

    case 'BinaryExpression': {
      const binaryNode = node as jsep.BinaryExpression;
      const left = evaluateNode(binaryNode.left, context);
      const right = evaluateNode(binaryNode.right, context);

      switch (binaryNode.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '==':
          return left == right;
        case '===':
          return left === right;
        case '!=':
          return left != right;
        case '!==':
          return left !== right;
        case '<':
          return left < right;
        case '>':
          return left > right;
        case '<=':
          return left <= right;
        case '>=':
          return left >= right;
        case '&&':
          return left && right;
        case '||':
          return left || right;
        default:
          return undefined;
      }
    }

    case 'LogicalExpression': {
      // jsep 也可以将 && 和 || 解析为 LogicalExpression
      const logicalNode = node as jsep.BinaryExpression;
      const left = evaluateNode(logicalNode.left, context);

      // 短路求值
      if (logicalNode.operator === '&&') {
        return left && evaluateNode(logicalNode.right, context);
      }
      if (logicalNode.operator === '||') {
        return left || evaluateNode(logicalNode.right, context);
      }
      return undefined;
    }

    case 'UnaryExpression': {
      const unaryNode = node as jsep.UnaryExpression;

      // 特殊处理 typeof，因为它允许操作未定义的变量而不报错
      if (unaryNode.operator === 'typeof') {
        if (unaryNode.argument.type === 'Identifier') {
          const name = (unaryNode.argument as jsep.Identifier).name;
          if (context && typeof context === 'object' && name in context) {
            return typeof context[name];
          }
          if (name in SAFE_GLOBALS) {
            return typeof SAFE_GLOBALS[name];
          }
          return 'undefined';
        }
        // 非 Identifier 的 typeof 正常求值
        const arg = evaluateNode(unaryNode.argument, context);
        return typeof arg;
      }

      const arg = evaluateNode(unaryNode.argument, context);

      switch (unaryNode.operator) {
        case '!':
          return !arg;
        case '-':
          return -arg;
        case '+':
          return +arg;
        default:
          return undefined;
      }
    }

    case 'ConditionalExpression': {
      const condNode = node as jsep.ConditionalExpression;
      const test = evaluateNode(condNode.test, context);
      return test
        ? evaluateNode(condNode.consequent, context)
        : evaluateNode(condNode.alternate, context);
    }

    case 'CallExpression': {
      const callNode = node as jsep.CallExpression;
      let funcName: string;
      let targetObj: any;
      let func: any;

      if (callNode.callee.type === 'MemberExpression') {
        const memberNode = callNode.callee as jsep.MemberExpression;
        targetObj = evaluateNode(memberNode.object, context);
        if (targetObj === undefined || targetObj === null) return undefined;
        if (memberNode.computed) {
          funcName = evaluateNode(memberNode.property, context);
        } else {
          funcName = (memberNode.property as jsep.Identifier).name;
        }
        if (typeof funcName !== 'string') return undefined;
        if (BLOCKED_CALL_METHODS.has(funcName)) return undefined;
        if (
          STRING_BLOCK.has(funcName) ||
          ARRAY_MUTATOR_BLOCK.has(funcName) ||
          ARRAY_CALLBACK_BLOCK.has(funcName)
        )
          return undefined;
        // 禁止自有属性覆盖：若 target 自身拥有该属性则视为污染
        if (Object.prototype.hasOwnProperty.call(targetObj, funcName)) return undefined;
        // 计算参数先于 intrinsic 检查? 需先检查以便过滤函数参数
        const args = callNode.arguments.map((arg) => evaluateNode(arg, context));
        if (args.some((a) => typeof a === 'function')) return undefined;
        // 固定 intrinsic 对比，不先读 target[funcName]
        const t = targetObj;
        if (typeof t === 'string' || t instanceof String) {
          if (!STRING_SAFE.has(funcName)) return undefined;
          func = (String.prototype as unknown as Record<string, unknown>)[funcName];
        } else if (Array.isArray(t)) {
          if (!ARRAY_SAFE.has(funcName)) return undefined;
          func = (Array.prototype as unknown as Record<string, unknown>)[funcName];
        } else if (typeof t === 'number' || t instanceof Number) {
          if (!NUMBER_SAFE.has(funcName)) return undefined;
          func = (Number.prototype as unknown as Record<string, unknown>)[funcName];
        } else if (t instanceof Date) {
          // Date 实例仅允许白名单子集（valueOf/toString/toISOString/getTime 等），此处最小化：toString/valueOf/toISOString/getTime
          const DATE_SAFE = new Set([
            'toString',
            'valueOf',
            'toISOString',
            'getTime',
            'getFullYear',
            'getMonth',
            'getDate',
          ]);
          if (!DATE_SAFE.has(funcName)) return undefined;
          func = (Date.prototype as unknown as Record<string, unknown>)[funcName];
        } else if (t === Math) {
          if (!MATH_SAFE.has(funcName)) return undefined;
          func = (Math as unknown as Record<string, unknown>)[funcName];
        } else if (t === JSON) {
          if (!JSON_SAFE.has(funcName)) return undefined;
          func = (JSON as unknown as Record<string, unknown>)[funcName];
        } else {
          return undefined;
        }
        if (typeof func !== 'function') return undefined;
        try {
          return func.apply(t, args);
        } catch {
          return undefined;
        }
      } else if (callNode.callee.type === 'Identifier') {
        funcName = (callNode.callee as jsep.Identifier).name;
        if (BLOCKED_CALL_METHODS.has(funcName)) return undefined;
        if (
          STRING_BLOCK.has(funcName) ||
          ARRAY_MUTATOR_BLOCK.has(funcName) ||
          ARRAY_CALLBACK_BLOCK.has(funcName)
        )
          return undefined;
        if (context && funcName in context) {
          // context 中函数已被 sanitize 去除，此处若仍存在则为潜在污染，直接拒绝
          return undefined;
        }
        if (funcName in SAFE_GLOBALS) {
          func = SAFE_GLOBALS[funcName];
          targetObj = undefined;
        } else {
          return undefined;
        }
        if (typeof func !== 'function') return undefined;
        const args = callNode.arguments.map((arg) => evaluateNode(arg, context));
        if (args.some((a) => typeof a === 'function')) return undefined;
        try {
          return func.apply(targetObj, args);
        } catch {
          return undefined;
        }
      } else {
        return undefined;
      }
    }

    case 'NewExpression': {
      // 类似 CallExpression，但用于初始化对象
      const newNode = node as jsep.CallExpression; // JSEP 将 NewExpression 的结构定义得和 CallExpression 类似

      let className: string;
      let Cls: any;

      if (newNode.callee.type === 'Identifier') {
        className = (newNode.callee as jsep.Identifier).name;
        // 只能实例化白名单中允许的类（比如 Date）
        if (className in SAFE_GLOBALS) {
          Cls = SAFE_GLOBALS[className];
        }
      }

      if (typeof Cls !== 'function') {
        return undefined; // 不是一个安全或允许的构造函数
      }

      const args = newNode.arguments.map((arg) => evaluateNode(arg, context));

      try {
        return new Cls(...args);
      } catch (err) {
        return undefined;
      }
    }

    case 'ArrayExpression': {
      const arrNode = node as jsep.ArrayExpression;
      return arrNode.elements.map((elem) => (elem ? evaluateNode(elem, context) : undefined));
    }

    case 'Compound': {
      const compoundNode = node as jsep.Compound;
      if (!compoundNode.body || compoundNode.body.length === 0) {
        return undefined;
      }

      // 数据绑定表达式引擎应当仅为“单表达式（Single Expression）”计算。
      // 拒绝多语句执行防止恶意的副作用串联注入 (如 {{ a=1, b=2, leak(b) }})
      return evaluateNode(compoundNode.body[0], context);
    }

    default:
      // 不支持的语法节点（比如 ThisExpression 等），一律返回 undefined
      return undefined;
  }
}

/**
 * AST 缓存：避免每次渲染重复解析相同表达式
 * 使用简单 LRU 策略，超出容量时淘汰最早插入的条目
 */
const AST_CACHE_MAX_SIZE = 500;
const astCache = new Map<string, jsep.Expression>();

function getCachedAST(expression: string): jsep.Expression {
  const cached = astCache.get(expression);
  if (cached !== undefined) {
    // 移到末尾以维持 LRU 顺序
    astCache.delete(expression);
    astCache.set(expression, cached);
    return cached;
  }
  const ast = jsep(expression);
  if (astCache.size >= AST_CACHE_MAX_SIZE) {
    // 淘汰最早插入的条目（Map 迭代顺序 = 插入顺序）
    const firstKey = astCache.keys().next().value!;
    astCache.delete(firstKey);
  }
  astCache.set(expression, ast);
  return ast;
}

/**
 * 清除 AST 缓存（用于测试或热更新场景）
 */
export function clearASTCache(): void {
  astCache.clear();
}

/**
 * 安全评估表达式
 * 使用 jsep 解析 AST（带 LRU 缓存），并在白名单控制下求值
 *
 * @param expression 要计算的表达式字符串
 * @param context 上下文数据
 * @returns 表达式求值结果
 */
export function safeEvaluate(expression: string, context: Record<string, any> = {}): any {
  if (typeof expression !== 'string' || !expression.trim()) {
    return undefined;
  }
  let sanitized: Record<string, any>;
  try {
    // debug
    // console.log('[safeEvaluate] before pause', expression, 'paused', (globalThis as any).__pauseCheck?.());
    pauseTracking();
    sanitized = sanitizeContext(context);
  } finally {
    try {
      resumeTracking();
    } catch {
      // ignore
    }
  }
  // console.log('[safeEvaluate] after resume paused', (globalThis as any).__pauseCheck?.());
  try {
    const ast = getCachedAST(expression);
    return evaluateNode(ast, sanitized);
  } catch (error) {
    // 表达式语法报错，安全返回 undefined
    return undefined;
  }
}
