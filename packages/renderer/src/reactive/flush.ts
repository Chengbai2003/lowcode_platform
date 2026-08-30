/**
 * FlushScheduler - 基于微任务的批量更新调度器
 *
 * 使用微任务提供高效的批量回调执行。
 * 多个 schedule() 调用会合并到单个 flush 周期中。
 * 支持嵌套批处理以防止过早 flush。
 */

export class FlushScheduler {
  private queue: Array<() => void> = [];
  private flushing = false;
  private scheduled = false;
  private batchDepth = 0;
  private pendingMicrotask: boolean = false;

  /**
   * 调度一个回调在下次 flush 时执行。
   * flush 前的多次调用会合并为单次执行。
   * 回调按调度顺序执行。
   */
  schedule(callback: () => void): void {
    this.queue.push(callback);

    // 仅在未调度且不在批处理模式时调度微任务
    if (!this.scheduled && this.batchDepth === 0) {
      this.scheduleMicrotaskFlush();
    }
  }

  /**
   * 立即执行所有待处理的回调。
   * 可以手动调用以强制立即执行。
   * flush 期间添加的回调进入下一个周期。
   */
  flush(): void {
    // 在批处理模式下不 flush（除非在深度 0 手动 flush）
    if (this.batchDepth > 0) {
      return;
    }

    if (this.flushing) {
      // 已在 flush 中，回调将在当前周期处理
      return;
    }

    this.flushing = true;
    this.scheduled = false;
    this.pendingMicrotask = false;

    // 处理队列 - flush 期间添加的回调进入下一周期
    // 因为我们设置了 flushing = true，这会阻止重入
    while (this.queue.length > 0) {
      const callbacksToProcess = this.queue;
      this.queue = []; // 为 flush 期间添加的回调创建新队列

      for (const callback of callbacksToProcess) {
        try {
          callback();
        } catch (error) {
          // 记录错误但继续处理剩余回调
          console.error('[FlushScheduler] 回调错误:', error);
        }
      }
    }

    this.flushing = false;
  }

  /**
   * 检查是否有 flush 待处理。
   */
  isFlushPending(): boolean {
    return this.scheduled || this.flushing;
  }

  /**
   * 清除所有待处理的回调。
   * 尽可能取消待处理的微任务。
   */
  clear(): void {
    this.queue = [];
    this.scheduled = false;
    // 注意：无法真正取消已排队的微任务，
    // 但我们设置 scheduled=false，所以当它运行时将是无操作
    this.pendingMicrotask = false;
  }

  /**
   * 进入批处理模式（增加深度）。
   * 阻止 flush 直到调用相应次数的 exitBatch。
   */
  enterBatch(): void {
    this.batchDepth++;
  }

  /**
   * 退出批处理模式（减少深度）。
   * 当深度回到 0 时触发微任务 flush。
   */
  exitBatch(): void {
    if (this.batchDepth === 0) {
      console.warn('[FlushScheduler] exitBatch 调用但没有匹配的 enterBatch');
      return;
    }

    this.batchDepth--;

    // 当深度回到 0 时调度微任务 flush
    if (this.batchDepth === 0 && this.queue.length > 0 && !this.scheduled) {
      this.scheduleMicrotaskFlush();
    }
  }

  /**
   * 获取当前批处理深度。
   * 0 表示不在批处理模式。
   */
  getBatchDepth(): number {
    return this.batchDepth;
  }

  private scheduleMicrotaskFlush(): void {
    this.scheduled = true;
    this.pendingMicrotask = true;
    this.queueMicrotask();
  }

  /**
   * 排队微任务以运行 flush。
   * 使用 queueMicrotask 进行调度。
   */
  private queueMicrotask(): void {
    queueMicrotask(() => {
      // 检查是否仍在调度（可能已被清除）
      if (this.scheduled && this.pendingMicrotask) {
        this.flush();
      }
    });
  }
}

/**
 * 单例实例，方便使用
 */
export const flushScheduler = new FlushScheduler();
