import jsep from 'jsep';
import jsepNew from '@jsep-plugin/new';
import { FORBIDDEN_LOGIC_KEYS } from '@lowcode-platform/schema-contract';
import { pauseTracking, resumeTracking, isTrackingProxy } from '../../reactive/tracking';
import {
  cloneSanitizedSafe,
  fallbackCloneSafe,
  isPlainObject as isPlainObjectSafe,
} from '../../utils/safeClone';

function getIntrinsicSafe(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc) return undefined;
    if (desc.get || desc.set) return undefined;
    return desc.value;
  } catch {
    return undefined;
  }
}

jsep.plugins.register(jsepNew);
// jsep 默认不将 typeof 视作一元运算符，需要手动注册
jsep.addUnaryOp('typeof');

// 白名单：允许在表达式中使用的全局对象与方法 — null-prototype, frozen
export const SAFE_GLOBALS: Record<string, any> = Object.assign(Object.create(null), {
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
});
Object.freeze(SAFE_GLOBALS);

const hasOwn = (t: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(t, k);

// P0-3: internal pure utils (descriptor-safe clone via shared safeClone)
const PURE_UTILS_KEYS_INTERNAL = ['formatDate', 'uuid', 'clone'] as const;
function fallbackClonePureInternal<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  return fallbackCloneSafe(value, seen);
}
const pureFormatDateInternal = (date: Date | string, _format = 'YYYY-MM-DD'): string =>
  String(date);
const pureUuidInternal = (): string => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    return (crypto as any).randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const pureCloneInternal = <T>(obj: T): T => fallbackClonePureInternal(obj);
const INTERNAL_PURE_UTILS: Record<string, unknown> = {
  formatDate: pureFormatDateInternal,
  uuid: pureUuidInternal,
  clone: pureCloneInternal,
};

const BLOCKED_MEMBER_PROPS = new Set<string>(FORBIDDEN_LOGIC_KEYS);

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

const DATE_SAFE = new Set([
  'valueOf',
  'getTime',
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'getUTCFullYear',
  'getUTCMonth',
  'getUTCDate',
  'getUTCDay',
  'getUTCHours',
  'getUTCMinutes',
  'getUTCSeconds',
  'getUTCMilliseconds',
  'getTimezoneOffset',
  'toString',
  'toISOString',
  'toUTCString',
]);

// ——— P0-2: 输入净化（via shared safeClone, descriptor-safe） ———
const SANITIZE_SKIP = Symbol('sanitize-skip');
function isPlainObject(o: unknown): boolean {
  return isPlainObjectSafe(o);
}
function cloneSanitized(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  return cloneSanitizedSafe(value, seen, SANITIZE_SKIP, { isTrackingProxy });
}
/**
 * 宿主命名空间黑名单：表达式上下文不可见（Issue #19 / M0-4 Scope E）。
 * 业务数据命名空间（data/state/formData/user/route）与 renderer 内部
 * 纯 utils 保留。
 */
const HOST_EXPRESSION_KEYS: ReadonlyArray<string> = Object.freeze([
  'ui',
  'api',
  'dispatch',
  'getState',
  'navigate',
  'back',
  'session',
  'runtime',
  'hostCapabilities',
]);

function sanitizeContext(context: Record<string, any> | undefined): Record<string, any> {
  if (!context || typeof context !== 'object') return {};
  const cloned = cloneSanitized(context) as Record<string, any>;
  const out = (cloned as Record<string, any>) ?? {};
  // M0-4 Scope E：宿主对象/钩子不得进入表达式上下文（函数已被克隆剔除，
  // 这里连同宿主命名空间的对象外壳一并移除）
  for (const hostKey of HOST_EXPRESSION_KEYS) {
    delete out[hostKey];
  }
  // P0-3: reconstruct pure utils with internal implementations, not accepting context override
  const filtered: Record<string, any> = {};
  for (const kk of PURE_UTILS_KEYS_INTERNAL) {
    const fn = (INTERNAL_PURE_UTILS as Record<string, any>)[kk];
    if (typeof fn === 'function') filtered[kk] = fn;
  }
  if (Object.keys(filtered).length > 0) out.utils = filtered;
  return out;
}

/**
 * 安全计算 AST 节点
 */
export interface SafeEvaluateOptions {
  /** Computed 专用：拒绝对象经一元、宽松相等或 Math 运算触发隐式 ToPrimitive。 */
  readonly rejectImplicitObjectCoercion?: boolean;
}

function evaluateNode(
  node: jsep.Expression,
  context: Record<string, any>,
  options: SafeEvaluateOptions,
): any {
  if (!node) return undefined;

  switch (node.type) {
    case 'Literal': {
      return (node as jsep.Literal).value;
    }

    case 'Identifier': {
      const name = (node as jsep.Identifier).name;
      // 优先从上下文获取，其次是从白名单全局对象获取 — own-only (P1-high #3)
      if (context && typeof context === 'object' && hasOwn(context, name)) {
        return context[name];
      }
      if (hasOwn(SAFE_GLOBALS, name)) {
        return SAFE_GLOBALS[name];
      }
      return undefined;
    }

    case 'MemberExpression': {
      const memberNode = node as jsep.MemberExpression;
      const obj = evaluateNode(memberNode.object, context, options);

      if (obj === undefined || obj === null) {
        return undefined; // 防止 Cannot read properties of undefined
      }

      let propertyName: string | number;
      if (memberNode.computed) {
        // [表达式] 访问，如 items[0] 或是 items[i]
        propertyName = evaluateNode(memberNode.property, context, options);
      } else {
        // .属性 访问，如 user.name
        propertyName = (memberNode.property as jsep.Identifier).name;
      }

      // 安全检查：阻止访问原型链、构造函数及危险方法
      if (typeof propertyName === 'symbol') return undefined;
      if (typeof propertyName === 'string' && BLOCKED_MEMBER_PROPS.has(propertyName)) {
        return undefined;
      }

      // For tracking proxy, use direct access to trigger dependency collection (membrane handles security)
      if (isTrackingProxy(obj)) {
        return obj[propertyName];
      }
      // descriptor-safe access: block getter/setter if any (for non-proxy plain objects, sanitize already stripped getters)
      try {
        const desc = Object.getOwnPropertyDescriptor(obj, String(propertyName));
        if (desc && (desc.get || desc.set)) return undefined;
        if (desc && typeof desc.value === 'function') {
          return undefined;
        }
      } catch {
        return undefined;
      }

      // Use descriptor value if available to avoid invoking getter
      const desc2 = Object.getOwnPropertyDescriptor(obj, String(propertyName));
      if (desc2 && 'value' in desc2) return desc2.value;
      // For prototype chain, check for getter/function to block
      let proto = Object.getPrototypeOf(obj);
      while (proto) {
        const pd = Object.getOwnPropertyDescriptor(proto, String(propertyName));
        if (pd) {
          if (pd.get || pd.set) return undefined;
          if (typeof pd.value === 'function') return undefined;
          break;
        }
        proto = Object.getPrototypeOf(proto);
      }
      return obj[propertyName];
    }

    case 'BinaryExpression': {
      const binaryNode = node as jsep.BinaryExpression;
      const left = evaluateNode(binaryNode.left, context, options);
      const right = evaluateNode(binaryNode.right, context, options);

      // P0-3: block implicit coercion via Symbol.toPrimitive / valueOf: object operands fail-close for arithmetic/comparison
      const isObj = (v: unknown) => v !== null && typeof v === 'object';
      const op = binaryNode.operator;
      if (
        (isObj(left) || isObj(right)) &&
        (['+', '-', '*', '/', '%', '<', '>', '<=', '>='].includes(op) ||
          (options.rejectImplicitObjectCoercion && (op === '==' || op === '!=')))
      ) {
        return undefined;
      }

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
      const left = evaluateNode(logicalNode.left, context, options);

      // 短路求值
      if (logicalNode.operator === '&&') {
        return left && evaluateNode(logicalNode.right, context, options);
      }
      if (logicalNode.operator === '||') {
        return left || evaluateNode(logicalNode.right, context, options);
      }
      return undefined;
    }

    case 'UnaryExpression': {
      const unaryNode = node as jsep.UnaryExpression;

      // 特殊处理 typeof，因为它允许操作未定义的变量而不报错 — own-only
      if (unaryNode.operator === 'typeof') {
        if (unaryNode.argument.type === 'Identifier') {
          const name = (unaryNode.argument as jsep.Identifier).name;
          if (context && typeof context === 'object' && hasOwn(context, name)) {
            return typeof context[name];
          }
          if (hasOwn(SAFE_GLOBALS, name)) {
            return typeof SAFE_GLOBALS[name];
          }
          return 'undefined';
        }
        // 非 Identifier 的 typeof 正常求值
        const arg = evaluateNode(unaryNode.argument, context, options);
        return typeof arg;
      }

      const arg = evaluateNode(unaryNode.argument, context, options);

      if (
        options.rejectImplicitObjectCoercion &&
        arg !== null &&
        typeof arg === 'object' &&
        (unaryNode.operator === '+' || unaryNode.operator === '-')
      ) {
        return undefined;
      }

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
      const test = evaluateNode(condNode.test, context, options);
      return test
        ? evaluateNode(condNode.consequent, context, options)
        : evaluateNode(condNode.alternate, context, options);
    }

    case 'CallExpression': {
      const callNode = node as jsep.CallExpression;
      let funcName: string;
      let targetObj: any;
      let func: any;

      if (callNode.callee.type === 'MemberExpression') {
        const memberNode = callNode.callee as jsep.MemberExpression;
        targetObj = evaluateNode(memberNode.object, context, options);
        if (targetObj === undefined || targetObj === null) return undefined;
        if (memberNode.computed) {
          funcName = evaluateNode(memberNode.property, context, options);
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
        // P0-3/P1: hasOwnProperty 仅对业务 plain 对象生效，对 Math/JSON/String/Number/Array/Date/utils 等 intrinsic 跳过
        const isUtilsTarget = targetObj === (context as any).utils;
        const isIntrinsicTarget =
          targetObj === Math ||
          targetObj === JSON ||
          typeof targetObj === 'string' ||
          targetObj instanceof String ||
          Array.isArray(targetObj) ||
          typeof targetObj === 'number' ||
          targetObj instanceof Number ||
          targetObj instanceof Date ||
          isUtilsTarget;
        const isBusinessPlainForCall =
          !isIntrinsicTarget &&
          targetObj !== null &&
          typeof targetObj === 'object' &&
          isPlainObject(targetObj);
        if (isBusinessPlainForCall && Object.prototype.hasOwnProperty.call(targetObj, funcName))
          return undefined;
        // 固定 intrinsic 对比，不先读 target[funcName] — 先校验白名单再求值参数，避免对已拦截方法仍执行参数中的副作用
        const t = targetObj;
        if (typeof t === 'string' || t instanceof String) {
          if (!STRING_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(String.prototype, funcName);
        } else if (Array.isArray(t)) {
          if (!ARRAY_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(Array.prototype, funcName);
        } else if (typeof t === 'number' || t instanceof Number) {
          if (!NUMBER_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(Number.prototype, funcName);
        } else if (t instanceof Date) {
          if (!DATE_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(Date.prototype, funcName);
        } else if (t === Math) {
          if (!MATH_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(Math as unknown as object, funcName);
        } else if (t === JSON) {
          if (!JSON_SAFE.has(funcName)) return undefined;
          func = getIntrinsicSafe(JSON as unknown as object, funcName);
        } else if (
          t === (context as any).utils &&
          (PURE_UTILS_KEYS_INTERNAL as readonly string[]).includes(funcName)
        ) {
          // utils 命名空间：仅允许 PURE_UTILS 白名单，且从内部纯净实现取函数
          func = (INTERNAL_PURE_UTILS as Record<string, unknown>)[funcName];
        } else {
          return undefined;
        }
        if (typeof func !== 'function') return undefined;
        // 仅在白名单校验通过后求值参数
        const args = callNode.arguments.map((arg) => evaluateNode(arg, context, options));
        if (args.some((a) => typeof a === 'function')) return undefined;
        if (
          options.rejectImplicitObjectCoercion &&
          t === Math &&
          args.some((argument) => argument !== null && typeof argument === 'object')
        ) {
          return undefined;
        }
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
        if (context && hasOwn(context, funcName)) {
          // context 中函数已被 sanitize 去除，此处若仍存在则为潜在污染，直接拒绝 — own-only
          return undefined;
        }
        if (hasOwn(SAFE_GLOBALS, funcName)) {
          func = SAFE_GLOBALS[funcName];
          targetObj = undefined;
        } else {
          return undefined;
        }
        if (typeof func !== 'function') return undefined;
        const args = callNode.arguments.map((arg) => evaluateNode(arg, context, options));
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
      // 仅允许 Date 作为构造器
      const newNode = node as jsep.CallExpression;
      let className: string;
      let Cls: any;
      if (newNode.callee.type === 'Identifier') {
        className = (newNode.callee as jsep.Identifier).name;
        if (className === 'Date') {
          Cls = Date;
        } else {
          return undefined;
        }
      } else {
        return undefined;
      }
      if (typeof Cls !== 'function') {
        return undefined;
      }
      const args = newNode.arguments.map((arg) => evaluateNode(arg, context, options));
      try {
        return new Cls(...args);
      } catch (err) {
        return undefined;
      }
    }

    case 'ArrayExpression': {
      const arrNode = node as jsep.ArrayExpression;
      return arrNode.elements.map((elem) =>
        elem ? evaluateNode(elem, context, options) : undefined,
      );
    }

    case 'Compound': {
      const compoundNode = node as jsep.Compound;
      if (!compoundNode.body || compoundNode.body.length !== 1) {
        return undefined;
      }
      // 仅允许单表达式，拒绝多语句逗号串联
      return evaluateNode(compoundNode.body[0], context, options);
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
export function safeEvaluate(
  expression: string,
  context: Record<string, any> = {},
  options: SafeEvaluateOptions = {},
): any {
  if (typeof expression !== 'string' || !expression.trim()) {
    return undefined;
  }
  let sanitized: Record<string, any>;
  try {
    pauseTracking();
    sanitized = sanitizeContext(context);
  } finally {
    try {
      resumeTracking();
    } catch {
      // ignore
    }
  }
  try {
    const ast = getCachedAST(expression);
    return evaluateNode(ast, sanitized, options);
  } catch (error) {
    // 表达式语法报错，安全返回 undefined
    return undefined;
  }
}
