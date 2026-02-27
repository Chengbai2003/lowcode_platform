/**
 * 表达式解析器单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseExpression,
  evaluateExpression,
  interpolateTemplate,
  parseAndEvaluate,
  isExpression,
} from '../../../src/executor/parser/expressionParser';

describe('parseExpression', () => {
  describe('字面量解析', () => {
    it('应该解析数字字面量', () => {
      const result = parseExpression('123');
      expect(result.type).toBe('literal');
      expect(result.value).toBe(123);
    });

    it('应该解析浮点数字面量', () => {
      const result = parseExpression('123.45');
      expect(result.type).toBe('literal');
      expect(result.value).toBe(123.45);
    });

    it('应该解析布尔值字面量', () => {
      const result1 = parseExpression('true');
      expect(result1.type).toBe('literal');
      expect(result1.value).toBe(true);

      const result2 = parseExpression('false');
      expect(result2.type).toBe('literal');
      expect(result2.value).toBe(false);
    });

    it('应该解析null和undefined字面量', () => {
      const result1 = parseExpression('null');
      expect(result1.type).toBe('literal');
      expect(result1.value).toBe(null);

      const result2 = parseExpression('undefined');
      expect(result2.type).toBe('literal');
      expect(result2.value).toBe(undefined);
    });

    it('应该解析字符串字面量', () => {
      const result = parseExpression('hello world');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('hello world');
    });

    it('应该解析JSON对象', () => {
      const result = parseExpression('{"key": "value"}');
      expect(result.type).toBe('literal');
      expect(result.value).toEqual({ key: 'value' });
    });

    it('应该解析JSON数组', () => {
      const result = parseExpression('[1, 2, 3]');
      expect(result.type).toBe('literal');
      expect(result.value).toEqual([1, 2, 3]);
    });
  });

  describe('变量引用解析', () => {
    it('应该解析简单变量', () => {
      const result = parseExpression('{{name}}');
      expect(result.type).toBe('variable');
      expect(result.variables).toContain('name');
    });

    it('应该解析对象属性访问', () => {
      const result = parseExpression('{{user.name}}');
      expect(result.type).toBe('complex');
      expect(result.variables).toContain('user');
    });

    it('应该解析嵌套属性访问', () => {
      const result = parseExpression('{{data.user.profile.avatar}}');
      expect(result.type).toBe('complex');
      expect(result.variables).toContain('data');
    });
  });

  describe('复杂表达式解析', () => {
    it('应该解析算术表达式', () => {
      const result = parseExpression('{{a + b}}');
      expect(result.type).toBe('complex');
      expect(result.expression).toBe('a + b');
    });

    it('应该解析比较表达式', () => {
      const result = parseExpression('{{age > 18}}');
      expect(result.type).toBe('complex');
      expect(result.expression).toBe('age > 18');
    });

    it('应该解析逻辑表达式', () => {
      const result = parseExpression('{{a && b || c}}');
      expect(result.type).toBe('complex');
      expect(result.expression).toBe('a && b || c');
    });
  });

  describe('模板字符串解析', () => {
    it('应该识别模板字符串', () => {
      const result = parseExpression('Hello {{name}}, age is {{age}}');
      expect(result.type).toBe('template');
      expect(result.variables).toContain('name');
      expect(result.variables).toContain('age');
    });
  });
});

describe('evaluateExpression', () => {
  const context = {
    name: 'John',
    age: 30,
    user: {
      name: 'Jane',
      email: 'jane@example.com',
    },
    data: {
      user: {
        profile: {
          avatar: 'avatar.jpg',
        },
      },
    },
    a: 5,
    b: 3,
  };

  it('应该返回字面量的值', () => {
    const expr = parseExpression('123');
    expect(evaluateExpression(expr, context)).toBe(123);
  });

  it('应该返回简单变量的值', () => {
    const expr = parseExpression('{{name}}');
    expect(evaluateExpression(expr, context)).toBe('John');
  });

  it('应该解析嵌套属性', () => {
    const expr = parseExpression('{{user.name}}');
    expect(evaluateExpression(expr, context)).toBe('Jane');
  });

  it('应该计算复杂表达式', () => {
    const expr = parseExpression('{{a + b}}');
    expect(evaluateExpression(expr, context)).toBe(8);
  });

  it('应该计算比较表达式', () => {
    const expr = parseExpression('{{age > 18}}');
    expect(evaluateExpression(expr, context)).toBe(true);
  });

  it('应该处理不存在的变量', () => {
    const expr = parseExpression('{{nonexistent}}');
    expect(evaluateExpression(expr, context)).toBeUndefined();
  });

  // ========== 以下为 Step 1 新增的回归基线测试 ==========

  it('应该计算三元表达式', () => {
    const expr = parseExpression("{{ age > 18 ? 'Adult' : 'Minor' }}");
    expect(evaluateExpression(expr, context)).toBe('Adult');
  });

  it('应该解析深层嵌套属性访问链', () => {
    const expr = parseExpression('{{ data.user.profile.avatar }}');
    expect(evaluateExpression(expr, context)).toBe('avatar.jpg');
  });

  it('应该计算算术组合', () => {
    const expr = parseExpression('{{ (a + b) * 2 }}');
    expect(evaluateExpression(expr, context)).toBe(16);
  });

  it('应该计算逻辑组合', () => {
    const expr = parseExpression('{{ a > 3 && b < 10 }}');
    expect(evaluateExpression(expr, context)).toBe(true);
  });

  it('应该处理字符串严格相等比较', () => {
    const expr = parseExpression("{{ name === 'John' }}");
    expect(evaluateExpression(expr, context)).toBe(true);
  });

  it('应该支持取反运算 (!)', () => {
    // 假设 context 里加上 disabled: false
    const expr = parseExpression('{{ !disabled }}');
    const localContext = { ...context, disabled: false };
    expect(evaluateExpression(expr, localContext)).toBe(true);
  });

  it('应该支持数组索引访问', () => {
    const expr = parseExpression('{{ items[0] }}');
    const localContext = { ...context, items: [10, 20, 30] };
    expect(evaluateExpression(expr, localContext)).toBe(10);
  });

  it('应该支持白名单内的方法调用', () => {
    const expr1 = parseExpression('{{ Math.max(a, b) }}');
    expect(evaluateExpression(expr1, context)).toBe(5);

    const expr2 = parseExpression('{{ JSON.stringify(data) }}');
    expect(evaluateExpression(expr2, context)).toBe('{"user":{"profile":{"avatar":"avatar.jpg"}}}');
  });

  it('应该安全返回 undefined 如果属性链断裂', () => {
    const expr = parseExpression('{{ data.nonexistent.avatar }}');
    expect(evaluateExpression(expr, context)).toBeUndefined();
  });
});

describe('interpolateTemplate', () => {
  const context = {
    name: 'John',
    age: 30,
    city: 'Beijing',
  };

  it('应该插值模板字符串', () => {
    const result = interpolateTemplate('Hello {{name}}', context);
    expect(result).toBe('Hello John');
  });

  it('应该插值多个表达式', () => {
    const result = interpolateTemplate('{{name}} is {{age}} years old', context);
    expect(result).toBe('John is 30 years old');
  });

  it('应该处理表达式和文本混合', () => {
    const result = interpolateTemplate('Hello {{name}}, welcome to {{city}}!', context);
    expect(result).toBe('Hello John, welcome to Beijing!');
  });

  it('应该处理模板字符串插值中包含复杂表达式', () => {
    const result = interpolateTemplate('Hello {{ age + 10 }} years later', context);
    expect(result).toBe('Hello 40 years later');
  });

  it('应该处理表达式为undefined或null的情况', () => {
    const contextWithNull = { name: null };
    const result = interpolateTemplate('Hello {{name}}', contextWithNull);
    expect(result).toBe('Hello ');
  });

  it('应该插值数字表达式', () => {
    const result = interpolateTemplate('Age: {{age}}', context);
    expect(result).toBe('Age: 30');
  });

  it('应该插值布尔表达式', () => {
    const result = interpolateTemplate('Active: {{age > 25}}', context);
    expect(result).toBe('Active: true');
  });
});

describe('parseAndEvaluate', () => {
  const context = {
    name: 'John',
    age: 30,
    score: 100,
  };

  it('应该直接返回非字符串值', () => {
    expect(parseAndEvaluate(123, context)).toBe(123);
    expect(parseAndEvaluate(true, context)).toBe(true);
    expect(parseAndEvaluate(null, context)).toBe(null);
    expect(parseAndEvaluate({ key: 'value' }, context)).toEqual({ key: 'value' });
    expect(parseAndEvaluate([1, 2, 3], context)).toEqual([1, 2, 3]);
  });

  it('应该解析并求值字符串', () => {
    expect(parseAndEvaluate('{{name}}', context)).toBe('John');
    expect(parseAndEvaluate('{{age}}', context)).toBe(30);
  });

  it('应该返回纯文本字符串', () => {
    expect(parseAndEvaluate('hello world', context)).toBe('hello world');
  });

  it('应该计算表达式', () => {
    expect(parseAndEvaluate('{{score / 10}}', context)).toBe(10);
  });
});

describe('isExpression', () => {
  it('应该识别表达式字符串', () => {
    expect(isExpression('{{name}}')).toBe(true);
    expect(isExpression('{{a + b}}')).toBe(true);
    expect(isExpression('Hello {{name}}')).toBe(true);
  });

  it('应该返回false对于非表达式字符串', () => {
    expect(isExpression('hello world')).toBe(false);
    expect(isExpression('123')).toBe(false);
    expect(isExpression('')).toBe(false);
  });

  it('应该返回false对于非字符串值', () => {
    expect(isExpression(123)).toBe(false);
    expect(isExpression(true)).toBe(false);
    expect(isExpression(null)).toBe(false);
    expect(isExpression({})).toBe(false);
    expect(isExpression([])).toBe(false);
  });
});

describe('边界情况', () => {
  it('应该处理空字符串', () => {
    const result = parseExpression('');
    expect(result.type).toBe('literal');
    expect(result.value).toBe('');
  });

  it('应该处理只包含空格的字符串', () => {
    const result = parseExpression('   ');
    expect(result.type).toBe('literal');
    expect(result.value).toBe('   ');
  });

  it('应该处理特殊字符', () => {
    const result = parseExpression('!@#$%^&*()');
    expect(result.type).toBe('literal');
    expect(result.value).toBe('!@#$%^&*()');
  });

  it('应该处理unicode字符', () => {
    const result = parseExpression('你好世界');
    expect(result.type).toBe('literal');
    expect(result.value).toBe('你好世界');
  });

  it('应该处理科学计数法数字', () => {
    const result = parseExpression('1.23e-5');
    expect(result.type).toBe('literal');
    expect(result.value).toBe(1.23e-5);
  });

  it('应该处理负数', () => {
    const result = parseExpression('-123');
    expect(result.type).toBe('literal');
    expect(result.value).toBe(-123);
  });
});

describe('新引擎增强能力', () => {
  const context = {
    name: 'John',
    age: 30,
    a: 5,
    b: 3,
    items: [10, 20, 30],
  };

  it('应该正常求值 typeof 运算', () => {
    const expr = parseExpression('{{ typeof name }}');
    expect(evaluateExpression(expr, context)).toBe('string');
  });

  it('应该支持多层嵌套三元表达式', () => {
    const expr = parseExpression("{{ a > 3 ? (b > 5 ? 'big' : 'mid') : 'small' }}");
    expect(evaluateExpression(expr, context)).toBe('mid');
  });

  it('应该支持包含 new 关键字的实例化调用', () => {
    const expr = parseExpression('{{ new Date("2020-01-01").getFullYear() }}');
    expect(evaluateExpression(expr, context)).toBe(2020);
  });
});
