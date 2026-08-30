import type { ActionList } from '../dsl';

/**
 * 数据资源只读状态（M1b 正式数据源落地前的最小形状）
 */
export interface DataResourceState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly data?: unknown;
  readonly error?: unknown;
}

/**
 * 组件运行时桥（Issue #19 / M0-4 Scope C）
 *
 * 渲染树中的组件（如 Table）不得反向导入 Renderer 内部执行器
 * （DSLExecutor / valueResolver / EventDispatcher 的具体实现），
 * 一律通过本桥消费受控能力。桥实例由 Renderer 在挂载时创建，
 * 并通过 ComponentRuntimeBridgeContext 注入。
 */
export interface ComponentRuntimeBridge {
  /**
   * 解析表达式/模板值。scope 会合并进当前执行上下文（行级/单元格级数据）。
   */
  resolveValue(value: unknown, scope?: Record<string, unknown>): unknown;

  /**
   * 执行一段 Schema ActionList（如表格行操作按钮）。
   * event 为触发事件，extraContext 注入行级上下文。
   */
  executeActions(
    actions: ActionList,
    event?: unknown,
    extraContext?: Record<string, unknown>,
  ): Promise<unknown>;

  /**
   * 读取数据资源只读状态。M1b 前默认 deny（返回 error 态），
   * Scope E HostCapabilities 落地后由宿主显式授予。
   */
  getResource(resourceId: string): Readonly<DataResourceState>;
}
