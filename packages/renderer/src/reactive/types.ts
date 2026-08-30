/**
 * 响应式运行时的共享类型定义
 *
 * 这些类型支持 ReactiveRuntime v3 实现，
 * 为数据路径、脏路径追踪、快照和订阅管理提供类型安全。
 *
 * @module renderer/reactive/types
 */

/**
 * 数据路径字符串，用于标识运行时中的特定值。
 *
 * 示例：
 * - "input1" - 顶层组件数据
 * - "state.loading" - DSL 运行时状态
 * - "formData.user.name" - 深层表单数据路径
 *
 * @public
 */
export type DataPath = string;

/**
 * 脏路径可以是特定变更路径的集合，或者是 'all' 表示全量失效。
 *
 * - `Set<DataPath>` - 具体变更的路径，支持精准更新
 * - `'all'` - 全量失效信号，需要重新计算所有计算值
 *
 * @public
 */
export type DirtyPaths = Set<DataPath> | 'all';

/**
 * 用于 useSyncExternalStore 兼容的不可变运行时快照。
 *
 * 此接口表示运行时状态的时间点视图，
 * 可在 React 渲染期间安全读取而不会产生副作用。
 * 所有属性都是只读的，以防止意外修改。
 *
 * @public
 */
export interface RuntimeSnapshot {
  /**
   * 组件业务数据（按组件 ID 索引）。
   * 这是组件值的主要数据命名空间。
   */
  readonly data: Record<string, unknown>;

  /**
   * DSL 运行时状态（loading、submitting、step、temp 等）。
   * 用于追踪异步操作和流程控制状态。
   */
  readonly state: Record<string, unknown>;

  /**
   * 表单数据（为未来表单系统保留的命名空间）。
   * @remarks 当前为保留命名空间，v3 中未完全实现。
   */
  readonly formData: Record<string, unknown>;

  /**
   * Schema 组件池引用。
   * 提供组件定义的访问，用于表达式解析。
   */
  readonly components: Record<string, unknown>;

  /**
   * 每次状态变更时递增的版本号。
   * 用于检测变更并触发 React 重新渲染。
   */
  readonly version: number;
}

/**
 * 内部可变运行时数据结构。
 *
 * 此接口表示可修改的实际运行时状态。
 * 它包含与 RuntimeSnapshot 相同的数据，但没有只读约束，
 * 并包含用于追踪变更和调试的额外元数据。
 *
 * @internal
 */
export interface RuntimeData {
  /**
   * 组件业务数据（按组件 ID 索引）。
   */
  data: Record<string, unknown>;

  /**
   * DSL 运行时状态（loading、submitting、step、temp 等）。
   */
  state: Record<string, unknown>;

  /**
   * 表单数据（为未来表单系统保留的命名空间）。
   */
  formData: Record<string, unknown>;

  /**
   * Schema 组件池引用。
   */
  components: Record<string, unknown>;

  /**
   * 用于版本追踪和脏路径管理的运行时元数据。
   */
  meta: RuntimeMeta;
}

/**
 * 用于追踪变更和调试的运行时元数据。
 *
 * 此接口包含有关运行时当前状态的信息，
 * 包括版本追踪、脏路径管理和可选的调试信息。
 *
 * @internal
 */
export interface RuntimeMeta {
  /**
   * 每次状态变更时递增的版本号。
   */
  version: number;

  /**
   * 自上次 flush 以来变更的路径集合，
   * 或 'all' 表示全量失效。
   */
  dirtyPaths: DirtyPaths;

  /**
   * 开发调试信息。
   * 包含最后一次更新操作的描述。
   */
  lastUpdate?: string;
}

/**
 * 订阅监听器回调类型。
 *
 * 当运行时状态变更且需要通知订阅者时调用。
 * 监听器应该是纯函数，通过 useSyncExternalStore 的变更检测机制触发 React 更新。
 *
 * @public
 */
export type SubscriptionListener = () => void;

/**
 * 订阅方法返回的取消订阅函数。
 *
 * 调用此函数将从运行时移除关联的监听器。
 * 可以安全地多次调用 - 后续调用是无操作。
 *
 * @public
 */
export type Unsubscribe = () => void;

/**
 * 用于依赖收集的追踪回调类型。
 *
 * 在追踪上下文中的表达式求值期间访问数据路径时调用。
 * 用于构建计算值的依赖图。
 *
 * @internal
 */
export type TrackingCallback = (path: DataPath) => void;
