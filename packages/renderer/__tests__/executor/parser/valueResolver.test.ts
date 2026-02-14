/**
 * 值解析器单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveValue,
  resolveValues,
  resolveArray,
  getValueType,
  safeGet,
  safeSet,
  deepMerge,
} from '../../../src/executor/parser/valueResolver';

describe('resolveValue', () => {
  const mockContext = {
    name: 'John',
    age: 30,
    user: {
      id: '123',
      profile: {
        avatar: 'avatar.jpg',
      },
    },
    items: [1, 2, 3],
    formData: {
      name: 'Jane',
      email: 'jane@example.com',
    },
  };

  describe('基本类型解析', () => {
    it('应该返回null和undefined', () => {
      expect(resolveValue(null, mockContext)).toBeNull();
      expect(resolveValue(undefined, mockContext)).toBeUndefined();
    });

    it('应该返回数字', () => {
      expect(resolveValue(123, mockContext)).toBe(123);
      expect(resolveValue(-456, mockContext)).toBe(-456);
      expect(resolveValue(3.14, mockContext)).toBe(3.14);
    });

    it('应该返回布尔值', () => {
      expect(resolveValue(true, mockContext)).toBe(true);
      expect(resolveValue(false, mockContext)).toBe(false);
    });

    it('应该返回非表达式字符串', () => {
      expect(resolveValue('hello world', mockContext)).toBe('hello world');
      expect(resolveValue('123', mockContext)).toBe('123');
    });
  });

  describe('表达式字符串解析', () => {
    it('应该解析变量引用', () => {
      expect(resolveValue('{{name}}', mockContext)).toBe('John');
      expect(resolveValue('{{age}}', mockContext)).toBe(30);
    });

    it('应该解析嵌套属性', () => {
      expect(resolveValue('{{user.id}}', mockContext)).toBe('123');
      expect(resolveValue('{{user.profile.avatar}}', mockContext)).toBe('avatar.jpg');
    });

    it('应该解析复杂表达式', () => {
      expect(resolveValue('{{a + b}}', mockContext)).toBeNaN(); // a,b 是 undefined, undefined + undefined = NaN
      expect(resolveValue('{{age > 25}}', mockContext)).toBe(true);
    });

    it('应该处理不存在的变量', () => {
      expect(resolveValue('{{nonexistent}}', mockContext)).toBeUndefined();
      expect(resolveValue('{{user.invalid}}', mockContext)).toBeUndefined();
    });
  });

  describe('数组解析', () => {
    it('应该解析静态数组', () => {
      const result = resolveValue([1, 2, 3], mockContext);
      expect(result).toEqual([1, 2, 3]);
    });

    it('应该递归解析数组中的表达式', () => {
      const result = resolveValue(['{{name}}', 123, '{{age}}'], mockContext);
      expect(result).toEqual(['John', 123, 30]);
    });

    it('应该解析嵌套数组', () => {
      const result = resolveValue([[1, 2], [3, 4]], mockContext);
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('应该解析数组中的对象', () => {
      const result = resolveValue([{ name: '{{name}}' }], mockContext);
      expect(result).toEqual([{ name: 'John' }]);
    });
  });

  describe('对象解析', () => {
    it('应该解析静态对象', () => {
      const result = resolveValue({ key: 'value', num: 123 }, mockContext);
      expect(result).toEqual({ key: 'value', num: 123 });
    });

    it('应该递归解析对象中的表达式', () => {
      const result = resolveValue({
        name: '{{name}}',
        age: '{{age}}',
        user: '{{user.id}}',
      }, mockContext);
      expect(result).toEqual({
        name: 'John',
        age: 30,
        user: '123',
      });
    });

    it('应该解析嵌套对象', () => {
      const result = resolveValue({
        outer: {
          inner: {
            value: '{{name}}',
          },
        },
      }, mockContext);
      expect(result).toEqual({
        outer: {
          inner: {
            value: 'John',
          },
        },
      });
    });

    it('应该解析对象中的数组', () => {
      const result = resolveValue({
        items: ['{{name}}', '{{age}}'],
      }, mockContext);
      expect(result).toEqual({
        items: ['John', 30],
      });
    });

    it('应该保留null和undefined值', () => {
      const result = resolveValue({
        nullValue: null,
        undefinedValue: undefined,
      }, mockContext);
      expect(result).toEqual({
        nullValue: null,
        undefinedValue: undefined,
      });
    });
  });
});

describe('resolveValues', () => {
  const mockContext = {
    name: 'John',
    age: 30,
  };

  it('应该解析多个值', () => {
    const values = {
      name: '{{name}}',
      age: '{{age}}',
      city: 'Beijing',
    };
    const result = resolveValues(values, mockContext);
    expect(result).toEqual({
      name: 'John',
      age: 30,
      city: 'Beijing',
    });
  });

  it('应该处理空对象', () => {
    const result = resolveValues({}, mockContext);
    expect(result).toEqual({});
  });
});

describe('resolveArray', () => {
  const mockContext = {
    name: 'John',
    age: 30,
  };

  it('应该解析数组中的所有值', () => {
    const values = ['{{name}}', 123, '{{age}}', null];
    const result = resolveArray(values, mockContext);
    expect(result).toEqual(['John', 123, 30, null]);
  });

  it('应该处理空数组', () => {
    const result = resolveArray([], mockContext);
    expect(result).toEqual([]);
  });
});

describe('getValueType', () => {
  it('应该识别字面量类型', () => {
    expect(getValueType(123)).toBe('literal');
    expect(getValueType('hello')).toBe('literal');
    expect(getValueType(true)).toBe('literal');
    expect(getValueType(null)).toBe('literal');
  });

  it('应该识别表达式类型', () => {
    expect(getValueType('{{name}}')).toBe('expression');
    expect(getValueType('{{age + 1}}')).toBe('expression');
  });

  it('应该识别对象类型', () => {
    expect(getValueType({})).toBe('object');
    expect(getValueType({ key: 'value' })).toBe('object');
  });

  it('应该识别数组类型', () => {
    expect(getValueType([])).toBe('array');
    expect(getValueType([1, 2, 3])).toBe('array');
  });

  it('应该识别函数类型', () => {
    const fn = () => { };
    expect(getValueType(fn)).toBe('function');
  });
});

describe('safeGet', () => {
  const obj = {
    user: {
      name: 'John',
      profile: {
        avatar: 'avatar.jpg',
      },
    },
    items: [1, 2, 3],
    nullValue: null,
  };

  it('应该获取简单属性', () => {
    expect(safeGet(obj, 'user.name')).toBe('John');
    expect(safeGet(obj, 'user.profile.avatar')).toBe('avatar.jpg');
  });

  it('应该返回undefined对于不存在的路径', () => {
    expect(safeGet(obj, 'user.invalid')).toBeUndefined();
    expect(safeGet(obj, 'invalid.path')).toBeUndefined();
  });

  it('应该处理null对象', () => {
    expect(safeGet(null, 'any.path')).toBeUndefined();
    expect(safeGet(null, 'any.path', 'default')).toBe('default');
  });

  it('应该使用默认值', () => {
    expect(safeGet(obj, 'user.invalid', 'default')).toBe('default');
  });

  it('应该处理数组访问', () => {
    expect(safeGet(obj, 'items.0')).toBe(1);
    expect(safeGet(obj, 'items.2')).toBe(3);
  });

  it('应该处理null值路径', () => {
    expect(safeGet(obj, 'nullValue.any.path')).toBeUndefined();
  });
});

describe('safeSet', () => {
  it('应该设置简单属性', () => {
    const obj: Record<string, any> = {};
    safeSet(obj, 'name', 'John');
    expect(obj.name).toBe('John');
  });

  it('应该设置嵌套属性', () => {
    const obj: Record<string, any> = {};
    safeSet(obj, 'user.name', 'John');
    expect(obj.user.name).toBe('John');
  });

  it('应该设置深层嵌套属性', () => {
    const obj: Record<string, any> = {};
    safeSet(obj, 'user.profile.avatar', 'avatar.jpg');
    expect(obj.user.profile.avatar).toBe('avatar.jpg');
  });

  it('应该覆盖已存在的值', () => {
    const obj = { name: 'Old' };
    safeSet(obj, 'name', 'New');
    expect(obj.name).toBe('New');
  });

  it('应该处理数组索引', () => {
    const obj: Record<string, any> = { items: [1, 2, 3] };
    safeSet(obj, 'items.1', 99);
    expect(obj.items[1]).toBe(99);
  });

  it('应该处理不存在的中间对象', () => {
    const obj: Record<string, any> = {};
    safeSet(obj, 'a.b.c', 'value');
    expect(obj.a.b.c).toBe('value');
  });

  it('应该处理空路径', () => {
    const obj = { existing: 'value' };
    safeSet(obj, '', 'new');
    expect(obj.existing).toBe('value');
  });
});

describe('deepMerge', () => {
  it('应该合并两个对象', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('应该深层合并嵌套对象', () => {
    const target = {
      user: {
        name: 'John',
        age: 30,
      },
    };
    const source = {
      user: {
        email: 'john@example.com',
        age: 31,
      },
    };
    const result = deepMerge(target, source);
    expect(result).toEqual({
      user: {
        name: 'John',
        age: 31,
        email: 'john@example.com',
      },
    });
  });

  it('应该覆盖源对象中的null值', () => {
    const target = { a: 1, b: 2 };
    const source = { b: null };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: null });
  });

  it('应该处理空对象', () => {
    const target = { a: 1 };
    const result = deepMerge(target, {});
    expect(result).toEqual({ a: 1 });
  });

  it('应该不修改原始对象', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
    expect(source).toEqual({ b: 2 });
  });

  it('应该处理数组（直接替换）', () => {
    const target = { items: [1, 2] };
    const source = { items: [3, 4] };
    const result = deepMerge(target, source);
    expect(result).toEqual({ items: [3, 4] });
  });
});

describe('边界情况', () => {
  it('应该处理空字符串', () => {
    const context = { name: 'John' };
    expect(resolveValue('', context)).toBe('');
  });

  it('应该处理空白字符串', () => {
    const context = { name: 'John' };
    expect(resolveValue('   ', context)).toBe('   ');
  });

  it('应该处理特殊字符', () => {
    const context = { name: 'John' };
    expect(resolveValue('!@#$%^&*()', context)).toBe('!@#$%^&*()');
  });

  it('应该处理unicode字符', () => {
    const context = { name: 'John' };
    expect(resolveValue('你好世界', context)).toBe('你好世界');
  });

  it('应该处理极大的数字', () => {
    const context = { value: Number.MAX_SAFE_INTEGER };
    expect(resolveValue('{{value}}', context)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('应该处理极小的数字', () => {
    const context = { value: Number.MIN_SAFE_INTEGER };
    expect(resolveValue('{{value}}', context)).toBe(Number.MIN_SAFE_INTEGER);
  });
});
