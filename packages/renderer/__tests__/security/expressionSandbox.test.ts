
import { describe, it, expect } from 'vitest';
import { parseAndEvaluate } from '../../src/executor/parser/expressionParser';

describe('Expression Parser Security Sandbox', () => {
  const context = {
    name: 'User',
    age: 30,
    data: { id: 1 },
  };

  it('应该允许访问上下文中的安全的变量', () => {
    expect(parseAndEvaluate('{{ name }}', context)).toBe('User');
    expect(parseAndEvaluate('{{ age + 1 }}', context)).toBe(31);
    expect(parseAndEvaluate('{{ data.id }}', context)).toBe(1);
  });

  it('应该允许使用安全的全局对象', () => {
    expect(parseAndEvaluate('{{ Math.max(1, 10) }}', context)).toBe(10);
    expect(parseAndEvaluate('{{ JSON.stringify(data) }}', context)).toBe('{"id":1}');
    expect(parseAndEvaluate('{{ new Date().getFullYear() > 2000 }}', context)).toBe(true);
  });

  it('应该阻止访问 window 对象 (修复验证)', () => {
    // 应该返回 undefined (被沙箱拦截)
    const result = parseAndEvaluate('{{ window }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止访问 document 对象', () => {
    const result = parseAndEvaluate('{{ document }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止通过 constructor 访问 Function (修复验证)', () => {
    // 典型的沙箱逃逸: [].constructor.constructor("return 1")()
    // 注意：由于现在的正则不支持嵌套括号，{{ ({}).constructor }} 可能无法匹配
    // 我们用 {{ [].constructor }} 来测试 constructor 访问是否被屏蔽

    // 如果没有屏蔽 constructor，这会返回 Array 构造函数
    // 如果屏蔽了，应该返回 undefined
    const result = parseAndEvaluate('{{ [].constructor }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止访问 globalThis', () => {
    const result = parseAndEvaluate('{{ globalThis }}', context);
    expect(result).toBeUndefined();
  });
});
