
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

  // ========== 以下为 Step 1 新增的安全基线测试 ==========

  it('应该阻止访问 process 对象', () => {
    const result = parseAndEvaluate('{{ process }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止 require 调用', () => {
    // 即使在 Node 环境中运行测试，要求也应该是被拦截或报错，而不是成功引入模块
    const result = parseAndEvaluate("{{ require('fs') }}", context);
    expect(result).toBeUndefined();
  });

  it('应该阻止 eval 调用', () => {
    const result = parseAndEvaluate("{{ eval('1+1') }}", context);
    expect(result).toBeUndefined();
  });

  it('应该阻止访问 this', () => {
    const result = parseAndEvaluate('{{ this }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止或安全处理立即执行函数 (IIFE)', () => {
    const result = parseAndEvaluate('{{ (() => { return 1; })() }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止复杂的原型链逃逸', () => {
    const result = parseAndEvaluate("{{ ''.constructor.constructor('return this')() }}", context);
    expect(result).toBeUndefined();
  });

  // ========== 以下为修复的 0day 安全漏洞基线测试 ==========

  it('应该阻止访问 console 等可能引发副作用的对象', () => {
    const result = parseAndEvaluate('{{ console.log("leak_info") }}', context);
    expect(result).toBeUndefined();
  });

  it('应该阻止访问 Object 和 Array 从而防止原型污染和内存 DoS', () => {
    const resultObj = parseAndEvaluate('{{ Object.assign(data, { hijacked: true }) }}', context);
    expect(resultObj).toBeUndefined();

    const resultArr = parseAndEvaluate('{{ Array.from({ length: 1e8 }) }}', context);
    expect(resultArr).toBeUndefined();
  });

  it('应该阻止通过 new 构建高危类如 RegExp 防止 ReDoS', () => {
    const result = parseAndEvaluate('{{ new RegExp("(a+)+") }}', context);
    expect(result).toBeUndefined();
  });
});
