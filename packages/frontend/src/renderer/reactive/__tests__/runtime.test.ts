/**
 * ReactiveRuntime 单元测试
 * @module renderer/reactive/runtime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReactiveRuntime } from '../runtime';

describe('ReactiveRuntime', () => {
  let runtime: ReactiveRuntime;

  beforeEach(() => {
    runtime = new ReactiveRuntime();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get() 和 set() 基本操作', () => {
    it('对不存在的路径应返回 undefined', () => {
      expect(runtime.get('input1')).toBeUndefined();
    });

    it('应设置并获取简单值', () => {
      runtime.set('input1', 'value1');

      expect(runtime.get('input1')).toBe('value1');
    });

    it('应覆盖已有值', () => {
      runtime.set('input1', 'value1');
      runtime.set('input1', 'value2');

      expect(runtime.get('input1')).toBe('value2');
    });

    it('应处理不同值类型', () => {
      runtime.set('string', 'text');
      runtime.set('number', 42);
      runtime.set('boolean', true);
      runtime.set('null', null);
      runtime.set('object', { nested: 'value' });

      expect(runtime.get('string')).toBe('text');
      expect(runtime.get('number')).toBe(42);
      expect(runtime.get('boolean')).toBe(true);
      expect(runtime.get('null')).toBeNull();
      expect(runtime.get('object')).toEqual({ nested: 'value' });
    });
  });

  describe('路径解析', () => {
    it('应解析简单路径（隐式 data 命名空间）', () => {
      runtime.set('input1', 'value');

      expect(runtime.get('input1')).toBe('value');
      expect(runtime.get('data.input1')).toBe('value');
    });

    it('应显式解析 data 命名空间', () => {
      runtime.set('data.input1', 'value');

      expect(runtime.get('input1')).toBe('value');
      expect(runtime.get('data.input1')).toBe('value');
    });

    it('应解析 state 命名空间', () => {
      runtime.set('state.loading', true);

      expect(runtime.get('state.loading')).toBe(true);
    });

    it('应解析 formData 命名空间', () => {
      runtime.set('formData.user', 'John');

      expect(runtime.get('formData.user')).toBe('John');
    });

    it('应解析 components 命名空间', () => {
      runtime.set('components.button', { type: 'Button' });

      expect(runtime.get('components.button')).toEqual({ type: 'Button' });
    });

    it('应解析深层路径', () => {
      runtime.set('data.user.profile.name', 'John');

      expect(runtime.get('user.profile.name')).toBe('John');
      expect(runtime.get('data.user.profile.name')).toBe('John');
    });

    it('应为深层路径创建中间对象', () => {
      runtime.set('a.b.c.d', 'deep');

      expect(runtime.get('a.b.c.d')).toBe('deep');
    });

    it('对不存在的深层路径应返回 undefined', () => {
      expect(runtime.get('nonexistent.deep.path')).toBeUndefined();
    });
  });

  describe('batch()', () => {
    it('应延迟通知直到批处理完成', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      let listenerCalledDuringBatch = false;
      runtime.batch(() => {
        runtime.set('input1', 'value1');
        runtime.set('input2', 'value2');
        runtime.set('input3', 'value3');
        listenerCalledDuringBatch = listener.mock.calls.length > 0;
      });

      // 批处理回调期间，监听器不应被调用
      expect(listenerCalledDuringBatch).toBe(false);

      // 批处理完成后仍应将通知推迟到微任务
      expect(listener).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应在批处理内立即执行更新', () => {
      runtime.batch(() => {
        runtime.set('input1', 'value1');
        expect(runtime.get('input1')).toBe('value1');

        runtime.set('input2', 'value2');
        expect(runtime.get('input2')).toBe('value2');
      });
    });

    it('应处理嵌套批处理', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      let listenerCalledDuringBatch = false;
      runtime.batch(() => {
        runtime.set('input1', 'value1');

        runtime.batch(() => {
          runtime.set('input2', 'value2');
        });
        listenerCalledDuringBatch = listener.mock.calls.length > 0;
      });

      // 批处理期间，监听器不应被调用
      expect(listenerCalledDuringBatch).toBe(false);

      // 外层批处理完成后，通知仍在微任务中发生
      expect(listener).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应正确追踪批处理深度', () => {
      expect(runtime.isInBatch()).toBe(false);

      runtime.batch(() => {
        expect(runtime.isInBatch()).toBe(true);
      });

      expect(runtime.isInBatch()).toBe(false);
    });
  });

  describe('patch()', () => {
    it('应一次性应用多个更新', () => {
      runtime.patch({
        input1: 'value1',
        input2: 'value2',
        'state.loading': true,
      });

      expect(runtime.get('input1')).toBe('value1');
      expect(runtime.get('input2')).toBe('value2');
      expect(runtime.get('state.loading')).toBe(true);
    });

    it('patch 后应触发通知', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      runtime.patch({
        input1: 'value1',
        input2: 'value2',
      });

      // patch 内部使用 batch，通知仍在微任务中发生
      expect(listener).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe()', () => {
    it('变更时应通知监听器', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      runtime.set('input1', 'value');

      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应返回取消订阅函数', async () => {
      const listener = vi.fn();
      const unsubscribe = runtime.subscribe(listener);

      runtime.set('input1', 'value1');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      runtime.set('input2', 'value2');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1); // 不再被调用
    });

    it('应支持多个监听器', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      runtime.subscribe(listener1);
      runtime.subscribe(listener2);

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('应优雅处理监听器错误', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn(() => {
        throw new Error('listener error');
      });
      const goodListener = vi.fn();

      runtime.subscribe(badListener);
      runtime.subscribe(goodListener);

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('取消订阅应可安全多次调用', async () => {
      const listener = vi.fn();
      const unsubscribe = runtime.subscribe(listener);

      unsubscribe();
      unsubscribe(); // 不应抛出错误

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribeComputed()', () => {
    it('依赖变更时应通知', async () => {
      const listener = vi.fn();
      const deps = new Set(['input1', 'input2']);

      runtime.subscribeComputed('node1', listener, deps);

      runtime.set('input1', 'value1');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('其他路径变更时不应通知', async () => {
      const listener = vi.fn();
      const deps = new Set(['input1']);

      runtime.subscribeComputed('node1', listener, deps);

      runtime.set('input2', 'value2');
      await vi.runAllTimersAsync();

      expect(listener).not.toHaveBeenCalled();
    });

    it('依赖前缀变更时应通知', async () => {
      const listener = vi.fn();
      const deps = new Set(['user.name']);

      runtime.subscribeComputed('node1', listener, deps);

      runtime.set('user', { name: 'John' });
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('依赖子路径变更时应通知', async () => {
      const listener = vi.fn();
      const deps = new Set(['user']);

      runtime.subscribeComputed('node1', listener, deps);

      runtime.set('user.name', 'John');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('无显式依赖时应始终通知', async () => {
      const listener = vi.fn();

      runtime.subscribeComputed('node1', listener);

      runtime.set('any.path', 'value');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应支持取消订阅', async () => {
      const listener = vi.fn();
      const deps = new Set(['input1']);

      const unsubscribe = runtime.subscribeComputed('node1', listener, deps);

      runtime.set('input1', 'value1');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      runtime.set('input1', 'value2');
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('相同 nodeId 应替换监听器', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const deps = new Set(['input1']);

      runtime.subscribeComputed('node1', listener1, deps);
      runtime.subscribeComputed('node1', listener2, deps);

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('应支持更新已注册节点的依赖集合', async () => {
      const listener = vi.fn();

      runtime.subscribeComputed('node1', listener, new Set(['input1']));
      runtime.updateComputedDeps('node1', new Set(['input2']));

      runtime.set('input1', 'skip');
      await vi.runAllTimersAsync();
      expect(listener).not.toHaveBeenCalled();

      runtime.set('input2', 'hit');
      await vi.runAllTimersAsync();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSnapshot()', () => {
    it('应返回不可变快照', () => {
      runtime.set('input1', 'value');

      const snapshot = runtime.getSnapshot();

      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(snapshot.data).toEqual({ input1: 'value' });
    });

    it('应包含版本号', () => {
      const snapshot1 = runtime.getSnapshot();

      runtime.set('input1', 'value');
      runtime.forceFlush();

      const snapshot2 = runtime.getSnapshot();

      expect(snapshot2.version).toBeGreaterThan(snapshot1.version);
    });

    it('变更后应返回不同快照', async () => {
      const snapshot1 = runtime.getSnapshot();

      runtime.set('input1', 'value');
      runtime.forceFlush();

      const snapshot2 = runtime.getSnapshot();

      expect(snapshot1).not.toBe(snapshot2);
    });
  });

  describe('getVersion()', () => {
    it('初始应返回 0', () => {
      expect(runtime.getVersion()).toBe(0);
    });

    it('set 后应递增', async () => {
      const v1 = runtime.getVersion();

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      const v2 = runtime.getVersion();

      expect(v2).toBeGreaterThan(v1);
    });
  });

  describe('追踪集成', () => {
    it('应使用追踪代理追踪依赖', () => {
      runtime.set('input1', 'value1');
      runtime.set('input2', 'value2');

      runtime.startTracking();
      const proxy = runtime.createTrackingProxy();

      // 访问属性
      void (proxy as Record<string, unknown>).input1;

      const deps = runtime.stopTracking();

      expect(deps.has('data.input1')).toBe(true);
    });

    it('应追踪嵌套路径', () => {
      runtime.set('user.name', 'John');

      runtime.startTracking();
      const proxy = runtime.createTrackingProxy();

      void ((proxy as Record<string, unknown>).user as Record<string, unknown>).name;

      const deps = runtime.stopTracking();

      expect(deps.has('data.user.name')).toBe(true);
    });

    it('应追踪 state 命名空间', () => {
      runtime.set('state.loading', true);

      runtime.startTracking();
      const proxy = runtime.createTrackingProxy();

      void ((proxy as Record<string, unknown>).state as Record<string, unknown>).loading;

      const deps = runtime.stopTracking();

      expect(deps.has('state.loading')).toBe(true);
    });

    it('写入追踪代理应抛出错误', () => {
      const proxy = runtime.createTrackingProxy();

      expect(() => {
        (proxy as Record<string, unknown>).input1 = 'value';
      }).toThrow('追踪代理是只读的');
    });
  });

  describe('initialize()', () => {
    it('应使用初始数据初始化', () => {
      runtime.initialize({ data: { input1: 'value' } });

      expect(runtime.get('input1')).toBe('value');
    });

    it('应使用初始状态初始化', () => {
      runtime.initialize({ state: { loading: true } });

      expect(runtime.get('state.loading')).toBe(true);
    });

    it('应使用组件初始化', () => {
      runtime.initialize({ components: { button: { type: 'Button' } } });

      expect(runtime.get('components.button')).toEqual({ type: 'Button' });
    });

    it('应使用 formData 初始化', () => {
      runtime.initialize({ formData: { profile: { name: 'Alice' } } });

      expect(runtime.get('formData.profile.name')).toBe('Alice');
    });

    it('应将版本重置为 0', () => {
      runtime.set('input1', 'value');
      runtime.forceFlush();

      expect(runtime.getVersion()).toBeGreaterThan(0);

      runtime.initialize({ data: {} });

      expect(runtime.getVersion()).toBe(0);
    });
  });

  describe('clear()', () => {
    it('应清除所有数据', () => {
      runtime.set('input1', 'value');
      runtime.set('state.loading', true);

      runtime.clear();

      expect(runtime.get('input1')).toBeUndefined();
      expect(runtime.get('state.loading')).toBeUndefined();
    });

    it('应清除所有监听器', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      runtime.clear();

      runtime.set('input1', 'value');
      await vi.runAllTimersAsync();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('工具方法', () => {
    describe('getDirtyPaths()', () => {
      it('初始应返回空集合', () => {
        const dirtyPaths = runtime.getDirtyPaths();
        expect(dirtyPaths).toBeInstanceOf(Set);
        expect((dirtyPaths as Set<string>).size).toBe(0);
      });

      it('set 后应返回脏路径', async () => {
        runtime.set('input1', 'value');

        const dirtyPaths = runtime.getDirtyPaths() as Set<string>;
        expect(dirtyPaths.has('input1') || dirtyPaths.has('data.input1')).toBe(true);
      });

      it('应按版本合并历史脏路径', async () => {
        runtime.set('input1', 'a');
        await vi.runAllTimersAsync();

        runtime.set('state.loading', true);
        await vi.runAllTimersAsync();

        const fromStart = runtime.getDirtyPaths(0);
        expect(fromStart).not.toBe('all');
        expect(
          (fromStart as Set<string>).has('input1') || (fromStart as Set<string>).has('data.input1'),
        ).toBe(true);
        expect((fromStart as Set<string>).has('state.loading')).toBe(true);

        const fromFirstFlush = runtime.getDirtyPaths(1);
        expect(fromFirstFlush).not.toBe('all');
        expect((fromFirstFlush as Set<string>).has('state.loading')).toBe(true);
        expect(
          (fromFirstFlush as Set<string>).has('input1') ||
            (fromFirstFlush as Set<string>).has('data.input1'),
        ).toBe(false);
      });

      it('查询当前版本时应返回空集合', async () => {
        runtime.set('input1', 'value');
        await vi.runAllTimersAsync();

        const currentVersion = runtime.getVersion();
        const dirtyPaths = runtime.getDirtyPaths(currentVersion);

        expect(dirtyPaths).not.toBe('all');
        expect((dirtyPaths as Set<string>).size).toBe(0);
      });

      it('应在版本历史中保留全量失效', async () => {
        runtime.markAllDirty();
        await vi.runAllTimersAsync();

        expect(runtime.getDirtyPaths(0)).toBe('all');
      });
    });

    describe('setComponents()', () => {
      it('应更新组件引用', () => {
        runtime.setComponents({ button: { type: 'Button' } });

        expect(runtime.get('components.button')).toEqual({ type: 'Button' });
      });
    });

    describe('getData() 和 getState()', () => {
      it('应返回原始数据用于调试', () => {
        runtime.set('input1', 'value');

        expect(runtime.getData()).toEqual({ input1: 'value' });
      });

      it('应返回原始状态用于调试', () => {
        runtime.set('state.loading', true);

        expect(runtime.getState()).toEqual({ loading: true });
      });

      it('应返回原始 formData 和 components 用于调试', () => {
        runtime.initialize({
          formData: { profile: { name: 'Alice' } },
          components: { button: { type: 'Button' } },
        });

        expect(runtime.getFormData()).toEqual({ profile: { name: 'Alice' } });
        expect(runtime.getComponents()).toEqual({ button: { type: 'Button' } });
      });
    });
  });

  describe('通知时机', () => {
    it('应通过微任务批量通知', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      runtime.set('input1', 'value1');

      // 监听器未立即调用
      expect(listener).not.toHaveBeenCalled();

      // 微任务后
      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('批处理期间不应通知，退出后在微任务中 flush', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      let listenerCalledDuringBatch = false;
      runtime.batch(() => {
        runtime.set('input1', 'value1');
        listenerCalledDuringBatch = listener.mock.calls.length > 0;
      });

      // 批处理回调期间，监听器不应被调用
      expect(listenerCalledDuringBatch).toBe(false);

      // 批处理完成后，通知仍等待微任务
      expect(listener).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应立即强制 flush', async () => {
      const listener = vi.fn();
      runtime.subscribe(listener);

      runtime.set('input1', 'value1');
      runtime.forceFlush();

      // 无需等待微任务
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
