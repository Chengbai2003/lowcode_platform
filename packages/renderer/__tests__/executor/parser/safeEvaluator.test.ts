import { describe, it, expect } from 'vitest';
import { safeEvaluate } from '../../../src/executor/parser/safeEvaluator';

describe('SafeEvaluator (jsep AST)', () => {
  const context = {
    name: 'John',
    age: 30,
    disabled: false,
    a: 5,
    b: 3,
    items: [10, 20, 30],
    user: { name: 'Jane', email: 'jane@example.com' },
    data: { user: { profile: { avatar: 'avatar.jpg' } } },
    increment: (n: number) => n + 1,
  };

  describe('基础节点求值', () => {
    it('应该解析字面量', () => {
      expect(safeEvaluate('123', context)).toBe(123);
      expect(safeEvaluate('"hello"', context)).toBe('hello');
      expect(safeEvaluate('true', context)).toBe(true);
      expect(safeEvaluate('null', context)).toBe(null);
    });

    it('应该解析标识符（从 context 中）', () => {
      expect(safeEvaluate('name', context)).toBe('John');
      expect(safeEvaluate('age', context)).toBe(30);
    });

    it('应该允许访问安全全局对象', () => {
      expect(safeEvaluate('Math', context)).toBe(Math);
      expect(safeEvaluate('undefined', context)).toBe(undefined);
    });
  });

  describe('属性访问 (MemberExpression)', () => {
    it('应该解析静态属性访问', () => {
      expect(safeEvaluate('user.name', context)).toBe('Jane');
      expect(safeEvaluate('data.user.profile.avatar', context)).toBe('avatar.jpg');
    });

    it('应该解析动态/计算属性访问', () => {
      expect(safeEvaluate('items[0]', context)).toBe(10);
      expect(safeEvaluate('items[1 + 1]', context)).toBe(30);
    });

    it('应该安全返回 undefined 对不存在的属性', () => {
      expect(safeEvaluate('data.nothing.here', context)).toBeUndefined();
    });

    it('应该阻止访问原型链和构造函数', () => {
      expect(safeEvaluate('user.__proto__', context)).toBeUndefined();
      expect(safeEvaluate('user.constructor', context)).toBeUndefined();
      expect(safeEvaluate('user["constructor"]', context)).toBeUndefined();
      expect(safeEvaluate('Array.prototype', context)).toBeUndefined();
    });
  });

  describe('二元及逻辑运算', () => {
    it('应该计算算术表达式', () => {
      expect(safeEvaluate('a + b', context)).toBe(8);
      expect(safeEvaluate('a * b', context)).toBe(15);
      expect(safeEvaluate('(a + b) * 2', context)).toBe(16);
    });

    it('应该计算比较表达式', () => {
      expect(safeEvaluate('age > 18', context)).toBe(true);
      expect(safeEvaluate('name === "John"', context)).toBe(true);
      expect(safeEvaluate('a <= 5', context)).toBe(true);
    });

    it('应该计算逻辑表达式 (短路)', () => {
      expect(safeEvaluate('a > 3 && b < 10', context)).toBe(true);
      expect(safeEvaluate('false && data.nothing.here', context)).toBe(false); // 短路，不报错
      expect(safeEvaluate('true || data.nothing.here', context)).toBe(true);
    });
  });

  describe('一元运算与三元表达式', () => {
    it('应该计算一元表达式', () => {
      expect(safeEvaluate('!disabled', context)).toBe(true);
      expect(safeEvaluate('-a', context)).toBe(-5);
      expect(safeEvaluate('typeof name', context)).toBe('string');
    });

    it('应该计算三元表达式', () => {
      expect(safeEvaluate('age > 18 ? "Adult" : "Minor"', context)).toBe('Adult');
      expect(safeEvaluate('disabled ? 0 : 1', context)).toBe(1);
    });
  });

  describe('函数调用 (CallExpression)', () => {
    it('应该允许调用 context 中的安全函数', () => {
      expect(safeEvaluate('increment(a)', context)).toBe(6);
    });

    it('应该允许调用白名单全局对象的方法', () => {
      expect(safeEvaluate('Math.max(a, b)', context)).toBe(5);
      expect(safeEvaluate('JSON.stringify(user)', context)).toBe('{"name":"Jane","email":"jane@example.com"}');
      expect(safeEvaluate('parseInt("100", 10)', context)).toBe(100);
    });

    it('应该阻止直接调用未授权全局函数', () => {
      // alert 不在 SAFE_GLOBALS 中
      expect(safeEvaluate('alert("hello")', context)).toBeUndefined();
      // setTimeout 也不在
      expect(safeEvaluate('setTimeout(increment, 100)', context)).toBeUndefined();
    });

    it('应该阻止通过方法访问调用敏感属性', () => {
      expect(safeEvaluate('user.constructor("return process")()', context)).toBeUndefined();
      expect(safeEvaluate('getItems().constructor', { getItems: () => [] })).toBeUndefined();
    });
  });

  describe('数组与其他结构', () => {
    it('应该解析数组字面量', () => {
      expect(safeEvaluate('[1, 2, a]', context)).toEqual([1, 2, 5]);
    });

    it('应该解析复合表达式 (Compound) 但为安全起见仅计算首个语句', () => {
      // 逗号分隔的表达式在传统 JS 会依次全部执行并返回最后一个。
      // 但对于安全表达式引擎而言，为防止如 {{a=1, leak(data)}} 这种连环副作用攻击，现在限定仅执行并返回第一条语句
      expect(safeEvaluate('a = 10, b = 20, a + b', context)).toBe(undefined);
      // 测试纯求值：a + 1 会得到 6
      expect(safeEvaluate('a + 1, b + 2', context)).toBe(6);
    });
  });

  describe('错误与异常处理', () => {
    it('应该静默处理非法 AST (如赋值)', () => {
      // jsep 能解析赋值，但 evaluateNode 会走到 default 分支返回 undefined
      expect(safeEvaluate('a = 10', context)).toBeUndefined();
    });

    it('应该静默处理语法错误', () => {
      // 语法错误被 try-catch 并返回 undefined
      expect(safeEvaluate('a + * b', context)).toBeUndefined();
    });
  });
});
