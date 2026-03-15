/**
 * 响应式运行时 - 渲染器的细粒度响应式系统
 *
 * 此模块提供完整的响应式运行时实现，包括：
 * - 统一的写入 API（set, patch, batch）用于数据变更
 * - 兼容 React useSyncExternalStore 的订阅系统
 * - 基于代理的依赖追踪，实现自动计算值更新
 * - 基于微任务的批量通知，实现最优性能
 * - 不可变快照，实现安全的 React 渲染阶段读取
 *
 * @example
 * ```typescript
 * import { ReactiveRuntime } from './reactive';
 *
 * const runtime = new ReactiveRuntime();
 *
 * // 设置数据
 * runtime.set('input1', 'Hello');
 * runtime.set('state.loading', true);
 *
 * // 批量更新
 * runtime.batch(() => {
 *   runtime.set('input1', 'World');
 *   runtime.set('state.loading', false);
 * });
 *
 * // 订阅变更（兼容 useSyncExternalStore）
 * const unsubscribe = runtime.subscribe(() => {
 *   console.log('状态已变更:', runtime.getSnapshot());
 * });
 *
 * // 获取不可变快照
 * const snapshot = runtime.getSnapshot();
 * console.log(snapshot.data.input1); // "World"
 * ```
 *
 * @module renderer/reactive
 */

// ========================================
// 公共类型
// ========================================

export type {
  DataPath,
  DirtyPaths,
  RuntimeSnapshot,
  SubscriptionListener,
  Unsubscribe,
} from './types';

// ========================================
// 核心运行时
// ========================================

export { ReactiveRuntime } from './runtime';

// ========================================
// 支撑服务
// ========================================

export { SnapshotManager } from './snapshot';

export { FlushScheduler, flushScheduler } from './flush';

// ========================================
// 依赖追踪
// ========================================

export { TrackingScope, createTrackingProxy, withTracking } from './tracking';
