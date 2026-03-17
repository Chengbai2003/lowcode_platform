/**
 * TrackingScope 和 createTrackingProxy 单元测试
 * @module renderer/reactive/tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TrackingScope,
  createTrackingProxy,
  createDeepTrackingProxy,
  withTracking,
} from '../tracking';

describe('TrackingScope', () => {
  let scope: TrackingScope;

  beforeEach(() => {
    scope = new TrackingScope();
  });

  describe('start()', () => {
    it('应激活追踪', () => {
      expect(scope.isActive()).toBe(false);
      scope.start();
      expect(scope.isActive()).toBe(true);
    });

    it('启动时应清除之前的依赖', () => {
      scope.start();
      scope.track('path1');
      scope.stop();

      scope.start();
      scope.track('path2');
      const deps = scope.stop();

      expect(deps.has('path1')).toBe(false);
      expect(deps.has('path2')).toBe(true);
    });
  });

  describe('stop()', () => {
    it('应停用追踪并返回依赖', () => {
      scope.start();
      scope.track('path1');
      scope.track('path2');

      expect(scope.isActive()).toBe(true);
      const deps = scope.stop();

      expect(scope.isActive()).toBe(false);
      expect(deps.size).toBe(2);
      expect(deps.has('path1')).toBe(true);
      expect(deps.has('path2')).toBe(true);
    });

    it('无依赖时应返回空集合', () => {
      scope.start();
      const deps = scope.stop();

      expect(deps.size).toBe(0);
    });

    it('每次应返回新集合', () => {
      scope.start();
      scope.track('path1');
      const deps1 = scope.stop();

      scope.start();
      scope.track('path2');
      const deps2 = scope.stop();

      expect(deps1).not.toBe(deps2);
      expect(deps1.has('path1')).toBe(true);
      expect(deps2.has('path2')).toBe(true);
    });
  });

  describe('track()', () => {
    it('追踪激活时应记录路径', () => {
      scope.start();
      scope.track('path1');
      scope.track('path2');
      scope.track('path1'); // 重复应被忽略

      const deps = scope.stop();
      expect(deps.size).toBe(2);
    });

    it('追踪未激活时不应记录路径', () => {
      scope.track('path1');

      scope.start();
      scope.track('path2');
      const deps = scope.stop();

      expect(deps.has('path1')).toBe(false);
      expect(deps.has('path2')).toBe(true);
    });
  });

  describe('isActive()', () => {
    it('初始应返回 false', () => {
      expect(scope.isActive()).toBe(false);
    });

    it('start() 后应返回 true', () => {
      scope.start();
      expect(scope.isActive()).toBe(true);
    });

    it('stop() 后应返回 false', () => {
      scope.start();
      scope.stop();
      expect(scope.isActive()).toBe(false);
    });
  });
});

describe('createTrackingProxy', () => {
  let tracker: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tracker = vi.fn();
  });

  describe('基本属性访问追踪', () => {
    it('应追踪简单属性访问', () => {
      const data = { input1: 'value1', input2: 'value2' };
      const proxy = createTrackingProxy(data, tracker);

      const value = proxy.input1;

      expect(value).toBe('value1');
      expect(tracker).toHaveBeenCalledWith('input1');
      expect(tracker).toHaveBeenCalledTimes(1);
    });

    it('应追踪多个属性访问', () => {
      const data = { a: 1, b: 2, c: 3 };
      const proxy = createTrackingProxy(data, tracker) as Record<string, number>;

      void (proxy.a + proxy.b + proxy.c);

      expect(tracker).toHaveBeenCalledWith('a');
      expect(tracker).toHaveBeenCalledWith('b');
      expect(tracker).toHaveBeenCalledWith('c');
      expect(tracker).toHaveBeenCalledTimes(3);
    });

    it('应追踪未定义属性的访问', () => {
      const data = { existing: 'value' };
      const proxy = createTrackingProxy(data, tracker);

      const value = proxy.nonexistent;

      expect(value).toBeUndefined();
      expect(tracker).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('嵌套路径追踪', () => {
    it('应追踪嵌套对象访问', () => {
      const data = { user: { name: 'John', age: 30 } };
      const proxy = createTrackingProxy(data, tracker);

      const name = (proxy.user as { name: string }).name;

      expect(name).toBe('John');
      expect(tracker).toHaveBeenCalledWith('user');
      expect(tracker).toHaveBeenCalledWith('user.name');
    });

    it('应追踪深度嵌套路径', () => {
      const data = { a: { b: { c: { d: 'deep' } } } };
      const proxy = createTrackingProxy(data, tracker) as Record<string, Record<string, unknown>>;

      void ((proxy.a as Record<string, unknown>).b as Record<string, unknown>).c;

      expect(tracker).toHaveBeenCalledWith('a');
      expect(tracker).toHaveBeenCalledWith('a.b');
      expect(tracker).toHaveBeenCalledWith('a.b.c');
    });

    it('应处理 null 嵌套值', () => {
      const data = { user: null };
      const proxy = createTrackingProxy(data, tracker);

      const value = proxy.user;

      expect(value).toBeNull();
      expect(tracker).toHaveBeenCalledWith('user');
    });

    it('应处理 undefined 嵌套值', () => {
      const data = { user: undefined };
      const proxy = createTrackingProxy(data, tracker);

      const value = proxy.user;

      expect(value).toBeUndefined();
      expect(tracker).toHaveBeenCalledWith('user');
    });
  });

  describe('写入保护', () => {
    it('set 操作应抛出错误', () => {
      const data = { input1: 'value' };
      const proxy = createTrackingProxy(data, tracker);

      expect(() => {
        proxy.input1 = 'new value';
      }).toThrow('无法设置属性 "input1" - 追踪代理是只读的');
    });

    it('delete 操作应抛出错误', () => {
      const data = { input1: 'value' };
      const proxy = createTrackingProxy(data, tracker);

      expect(() => {
        delete proxy.input1;
      }).toThrow('无法删除属性 "input1" - 追踪代理是只读的');
    });
  });

  describe('边界情况', () => {
    it('应处理 null 数据', () => {
      const proxy = createTrackingProxy(null as unknown as Record<string, unknown>, tracker);
      expect(proxy).toBeNull();
    });

    it('应处理 undefined 数据', () => {
      const proxy = createTrackingProxy(undefined as unknown as Record<string, unknown>, tracker);
      expect(proxy).toBeUndefined();
    });

    it('应处理原始值', () => {
      const proxy = createTrackingProxy('string' as unknown as Record<string, unknown>, tracker);
      expect(proxy).toBe('string');
    });

    it('应透传 Symbol 键而不追踪', () => {
      const data = { [Symbol.toStringTag]: 'TestObject' };
      const proxy = createTrackingProxy(data, tracker);

      const value = (proxy as any)[Symbol.toStringTag];

      expect(tracker).not.toHaveBeenCalled();
      expect(value).toBe('TestObject');
    });

    it('应忽略原型污染键', () => {
      const data = { __proto__: {}, constructor: 'test', prototype: 'test' };
      const proxy = createTrackingProxy(data, tracker);

      expect(proxy.__proto__).toBeUndefined();
      expect(proxy.constructor).toBeUndefined();
      expect(proxy.prototype).toBeUndefined();
    });

    it('应处理 has 检查', () => {
      const data = { existing: 'value' };
      const proxy = createTrackingProxy(data, tracker);

      expect('existing' in proxy).toBe(true);
      expect('nonexistent' in proxy).toBe(false);
      expect('__proto__' in proxy).toBe(false);
    });
  });

  describe('数组处理', () => {
    it('应追踪数组索引访问', () => {
      const data = { items: ['a', 'b', 'c'] };
      const proxy = createTrackingProxy(data, tracker);

      const item = (proxy.items as unknown[])[0];

      expect(item).toBe('a');
      expect(tracker).toHaveBeenCalledWith('items');
      expect(tracker).toHaveBeenCalledWith('items[0]');
    });

    it('应追踪数组长度', () => {
      const data = { items: [1, 2, 3] };
      const proxy = createTrackingProxy(data, tracker);

      const length = (proxy.items as unknown[]).length;

      expect(length).toBe(3);
      expect(tracker).toHaveBeenCalledWith('items');
      expect(tracker).toHaveBeenCalledWith('items.length');
    });

    it('应追踪数组方法调用', () => {
      const data = { items: [1, 2, 3] };
      const proxy = createTrackingProxy(data, tracker);

      const result = (proxy.items as number[]).map((x) => x * 2);

      expect(result).toEqual([2, 4, 6]);
      expect(tracker).toHaveBeenCalledWith('items');
      expect(tracker).toHaveBeenCalledWith('items.map()');
    });

    it('应追踪数组内的嵌套对象', () => {
      const data = { users: [{ name: 'John' }, { name: 'Jane' }] };
      const proxy = createTrackingProxy(data, tracker);

      const name = ((proxy.users as unknown[])[0] as { name: string }).name;

      expect(name).toBe('John');
      expect(tracker).toHaveBeenCalledWith('users');
      expect(tracker).toHaveBeenCalledWith('users[0]');
      expect(tracker).toHaveBeenCalledWith('users[0].name');
    });

    it('应处理空数组', () => {
      const data = { items: [] };
      const proxy = createTrackingProxy(data, tracker);

      const items = proxy.items;

      expect(Array.isArray(items)).toBe(true);
      expect(tracker).toHaveBeenCalledWith('items');
    });
  });

  describe('代理缓存', () => {
    it('对同一对象应返回相同代理', () => {
      const nestedObj = { name: 'John' };
      const data = { user: nestedObj };
      const proxy = createTrackingProxy(data, tracker);

      const user1 = proxy.user;
      const user2 = proxy.user;

      expect(user1).toBe(user2);
    });
  });
});

describe('createDeepTrackingProxy', () => {
  let tracker: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tracker = vi.fn();
  });

  it('应使用基础路径前缀追踪', () => {
    const data = { name: 'John' };
    const proxy = createDeepTrackingProxy(data, 'data.user', tracker);

    void proxy.name;

    expect(tracker).toHaveBeenCalledWith('data.user.name');
  });

  it('应处理空基础路径', () => {
    const data = { name: 'John' };
    const proxy = createDeepTrackingProxy(data, '', tracker);

    void proxy.name;

    expect(tracker).toHaveBeenCalledWith('name');
  });
});

describe('withTracking', () => {
  let scope: TrackingScope;

  beforeEach(() => {
    scope = new TrackingScope();
  });

  it('应返回结果和依赖', () => {
    const data = { input1: 'value1', input2: 'value2' };
    const fn = (tracked: Record<string, unknown>) => `${tracked.input1}-${tracked.input2}`;

    const [result, deps] = withTracking(scope, data, fn);

    expect(result).toBe('value1-value2');
    expect(deps.has('input1')).toBe(true);
    expect(deps.has('input2')).toBe(true);
  });

  it('函数完成后应停止追踪', () => {
    const data = { input1: 'value' };

    withTracking(scope, data, () => 'result');

    expect(scope.isActive()).toBe(false);
  });

  it('函数抛出错误时也应停止追踪', () => {
    const data = { input1: 'value' };
    const fn = () => {
      throw new Error('test error');
    };

    expect(() => withTracking(scope, data, fn)).toThrow('test error');
    expect(scope.isActive()).toBe(false);
  });

  it('函数执行期间应追踪依赖', () => {
    const data = { a: 1, b: 2 };
    const fn = (tracked: Record<string, unknown>) => (tracked.a as number) + (tracked.b as number);

    const [result, deps] = withTracking(scope, data, fn);

    expect(result).toBe(3);
    expect(deps.size).toBe(2);
  });
});
