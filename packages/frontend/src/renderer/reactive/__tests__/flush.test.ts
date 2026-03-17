/**
 * FlushScheduler 单元测试
 * @module renderer/reactive/flush
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlushScheduler } from '../flush';

describe('FlushScheduler', () => {
  let scheduler: FlushScheduler;

  beforeEach(() => {
    scheduler = new FlushScheduler();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('schedule()', () => {
    it('应调度单个回调', async () => {
      const callback = vi.fn();
      scheduler.schedule(callback);

      expect(callback).not.toHaveBeenCalled();

      // 执行微任务
      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应在 flush 前合并多个回调', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      scheduler.schedule(callback1);
      scheduler.schedule(callback2);
      scheduler.schedule(callback3);

      await vi.runAllTimersAsync();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('应保持回调顺序', async () => {
      const order: number[] = [];

      scheduler.schedule(() => order.push(1));
      scheduler.schedule(() => order.push(2));
      scheduler.schedule(() => order.push(3));

      await vi.runAllTimersAsync();

      expect(order).toEqual([1, 2, 3]);
    });

    it('批处理模式下不应调度微任务', async () => {
      const callback = vi.fn();

      scheduler.enterBatch();
      scheduler.schedule(callback);

      // 等待可能的微任务
      await vi.runAllTimersAsync();

      // 不应被调用，因为处于批处理模式
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    it('应执行所有待处理的回调', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      scheduler.schedule(callback1);
      scheduler.schedule(callback2);

      scheduler.flush();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('批处理模式下不应 flush', () => {
      const callback = vi.fn();

      scheduler.enterBatch();
      scheduler.schedule(callback);
      scheduler.flush();

      expect(callback).not.toHaveBeenCalled();
    });

    it('应在同一周期处理 flush 期间添加的回调', async () => {
      const order: string[] = [];

      scheduler.schedule(() => {
        order.push('first');
        scheduler.schedule(() => order.push('added-during-flush'));
      });

      scheduler.flush();

      // 实现使用 while 循环，所以两个回调在同一 flush 中处理
      expect(order).toEqual(['first', 'added-during-flush']);
    });

    it('应在 flush 后清除调度标志', async () => {
      scheduler.schedule(() => {});

      expect(scheduler.isFlushPending()).toBe(true);

      scheduler.flush();

      expect(scheduler.isFlushPending()).toBe(false);
    });

    it('不应重入 flush', async () => {
      let flushCount = 0;

      scheduler.schedule(() => {
        flushCount++;
        scheduler.flush(); // 应被忽略
      });

      scheduler.flush();

      expect(flushCount).toBe(1);
    });
  });

  describe('嵌套批处理', () => {
    it('批处理深度 > 0 时应阻止 flush', async () => {
      const callback = vi.fn();

      scheduler.enterBatch();
      scheduler.schedule(callback);
      await vi.runAllTimersAsync();

      expect(callback).not.toHaveBeenCalled();

      scheduler.exitBatch();
      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应正确处理嵌套批处理', async () => {
      const callback = vi.fn();

      scheduler.enterBatch(); // 深度 = 1
      scheduler.enterBatch(); // 深度 = 2
      scheduler.schedule(callback);
      await vi.runAllTimersAsync();

      expect(callback).not.toHaveBeenCalled();

      scheduler.exitBatch(); // 深度 = 1
      await vi.runAllTimersAsync();

      // 仍在深度 1，不应 flush
      expect(callback).not.toHaveBeenCalled();

      scheduler.exitBatch(); // 深度 = 0
      await vi.runAllTimersAsync();

      // 现在应该 flush
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应正确追踪批处理深度', () => {
      expect(scheduler.getBatchDepth()).toBe(0);

      scheduler.enterBatch();
      expect(scheduler.getBatchDepth()).toBe(1);

      scheduler.enterBatch();
      expect(scheduler.getBatchDepth()).toBe(2);

      scheduler.exitBatch();
      expect(scheduler.getBatchDepth()).toBe(1);

      scheduler.exitBatch();
      expect(scheduler.getBatchDepth()).toBe(0);
    });

    it('不匹配的 exitBatch 应发出警告', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      scheduler.exitBatch();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FlushScheduler] exitBatch 调用但没有匹配的 enterBatch',
      );
      expect(scheduler.getBatchDepth()).toBe(0);

      warnSpy.mockRestore();
    });

    it('队列有回调时应在 exitBatch 时 flush', async () => {
      const callback = vi.fn();

      scheduler.enterBatch();
      scheduler.schedule(callback);

      expect(callback).not.toHaveBeenCalled();

      scheduler.exitBatch();

      // exitBatch 不应同步 flush
      expect(callback).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      // 应在下一个微任务中 flush
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('错误处理', () => {
    it('应捕获并记录回调错误', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback1 = vi.fn(() => {
        throw new Error('test error');
      });
      const callback2 = vi.fn();

      scheduler.schedule(callback1);
      scheduler.schedule(callback2);

      scheduler.flush();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[FlushScheduler] 回调错误:', expect.any(Error));

      errorSpy.mockRestore();
    });

    it('错误后应继续处理剩余回调', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const order: number[] = [];

      scheduler.schedule(() => order.push(1));
      scheduler.schedule(() => {
        order.push(2);
        throw new Error('test error');
      });
      scheduler.schedule(() => order.push(3));

      scheduler.flush();

      expect(order).toEqual([1, 2, 3]);

      errorSpy.mockRestore();
    });
  });

  describe('clear()', () => {
    it('应清除所有待处理的回调', async () => {
      const callback = vi.fn();

      scheduler.schedule(callback);
      scheduler.clear();

      await vi.runAllTimersAsync();

      expect(callback).not.toHaveBeenCalled();
    });

    it('应重置调度标志', async () => {
      scheduler.schedule(() => {});
      scheduler.clear();

      expect(scheduler.isFlushPending()).toBe(false);
    });
  });

  describe('isFlushPending()', () => {
    it('回调被调度时应返回 true', () => {
      scheduler.schedule(() => {});
      expect(scheduler.isFlushPending()).toBe(true);
    });

    it('无调度时应返回 false', () => {
      expect(scheduler.isFlushPending()).toBe(false);
    });

    it('flush 后应返回 false', async () => {
      scheduler.schedule(() => {});
      scheduler.flush();

      expect(scheduler.isFlushPending()).toBe(false);
    });

    it('flush 期间应返回 true', () => {
      let isPendingDuringFlush = false;

      scheduler.schedule(() => {
        isPendingDuringFlush = scheduler.isFlushPending();
      });

      scheduler.flush();

      // flush 期间，由于 flushing 标志，isFlushPending 应为 true
      expect(isPendingDuringFlush).toBe(true);
    });
  });

  describe('getBatchDepth()', () => {
    it('初始应返回 0', () => {
      expect(scheduler.getBatchDepth()).toBe(0);
    });

    it('应返回当前批处理深度', () => {
      scheduler.enterBatch();
      expect(scheduler.getBatchDepth()).toBe(1);

      scheduler.enterBatch();
      expect(scheduler.getBatchDepth()).toBe(2);

      scheduler.exitBatch();
      expect(scheduler.getBatchDepth()).toBe(1);
    });
  });

  describe('微任务调度', () => {
    it('应使用微任务进行调度', async () => {
      const callback = vi.fn();

      scheduler.schedule(callback);

      // 微任务尚未执行
      expect(callback).not.toHaveBeenCalled();

      // 执行微任务
      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('多个回调只调度一个微任务', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      scheduler.schedule(callback1);
      scheduler.schedule(callback2);

      await vi.runAllTimersAsync();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
