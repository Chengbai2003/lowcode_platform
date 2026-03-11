import jsep from 'jsep';
import jsepNew from '@jsep-plugin/new';

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

      // 安全检查：阻止访问原型链和构造函数
      if (
        propertyName === '__proto__' ||
        propertyName === 'prototype' ||
        propertyName === 'constructor'
      ) {
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

      // 我们只支持对象方法的调用 (如 Math.max)，或者 context 里提供的安全函数
      // 不支持直接全局函数调用（比如未在 context 或白名单声明的 alert()）

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

        // 安全拦截
        if (
          funcName === '__proto__' ||
          funcName === 'prototype' ||
          funcName === 'constructor' ||
          [
            'assign',
            'defineProperty',
            'setPrototypeOf',
            'freeze',
            'seal',
            'preventExtensions',
          ].includes(funcName)
        ) {
          return undefined;
        }

        func = targetObj[funcName];
      } else if (callNode.callee.type === 'Identifier') {
        funcName = (callNode.callee as jsep.Identifier).name;

        if (context && funcName in context) {
          func = context[funcName];
          targetObj = context; // 函数的 this 绑定到 context
        } else if (funcName in SAFE_GLOBALS) {
          func = SAFE_GLOBALS[funcName];
          targetObj = SAFE_GLOBALS; // 函数的 this 绑定到 SAFE_GLOBALS
        }
      }

      if (typeof func !== 'function') {
        return undefined; // 不是一个可调用的函数
      }

      // 计算参数
      const args = callNode.arguments.map((arg) => evaluateNode(arg, context));

      try {
        return func.apply(targetObj, args);
      } catch (err) {
        return undefined; // 函数内部报错，安全静默
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

  try {
    const ast = getCachedAST(expression);
    return evaluateNode(ast, context);
  } catch (error) {
    // 表达式语法报错，安全返回 undefined
    return undefined;
  }
}
