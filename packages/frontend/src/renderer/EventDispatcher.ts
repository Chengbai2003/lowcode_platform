/**
 * 事件派发中心
 * 负责解析和执行 DSL Action 序列
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DSLExecutor } from './executor';
import type { ActionList, ExecutionContext } from '../types';
import { setComponentData, setComponentConfig } from './store/componentSlice';

/**
 * 事件派发中心类
 */
export class EventDispatcher {
  private context: Record<string, any>;
  private dispatch: any;
  private getState: any;
  private dslExecutor: DSLExecutor;
  private executionContext: ExecutionContext;

  // 响应式订阅机制（Phase 1）
  private version = 0;
  private listeners = new Set<() => void>();
  private pendingChangedKeys: Set<string> | 'all' = new Set();
  private snapshots = new Map<number, ReadonlySet<string> | 'all'>();
  private static MAX_SNAPSHOTS = 50;
  private flushScheduled = false;
  private mergedCache = new Map<number, ReadonlySet<string> | 'all'>();

  constructor(context: Record<string, any> = {}, dispatch: any, getState: any) {
    this.context = context;
    this.dispatch = dispatch;
    this.getState = getState;

    // 创建DSL执行引擎
    this.dslExecutor = new DSLExecutor({
      debug: process.env.NODE_ENV !== 'production',
      // Renderer runtime keeps legacy customScript available unless caller explicitly opts out.
      enableCustomScript: context.enableCustomScript ?? true,
      onError: (error, action) => {
        console.error('[DSL Error]', error.message, { action });
      },
      onLog: (level, message, data) => {
        (console as any)[level](`[DSL ${level}]`, message, data);
      },
    });

    // 创建执行上下文
    this.executionContext = DSLExecutor.createContext({
      dispatch: this.dispatch,
      getState: this.getState,
      data: {}, // 组件数据
      formData: {}, // 表单数据
      setComponentData: (id: string, value: any) => {
        let dispatchError: unknown;
        try {
          this.dispatch(setComponentData({ id, value }));
        } catch (error) {
          dispatchError = error;
        }

        // 无论 dispatch 是否抛错，都尽力从 store 回读最终状态并同步 executionContext，
        // 覆盖"中间件在 next(action) 后抛错"这类部分成功场景。
        const syncedFromStore = this.syncComponentDataFromStore(id);
        if (!syncedFromStore && dispatchError == null) {
          this._writeComponentData(id, value);
        }

        if (dispatchError) {
          throw dispatchError;
        }
      },
      setComponentConfig: (id: string, config: any) => {
        this.dispatch(setComponentConfig({ id, config }));
      },
      markFullChange: () => this.markFullChange(),
      ...this.context,
    });
  }

  /** 订阅 context 变化（符合 useSyncExternalStore 协议） */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 获取当前版本号（useSyncExternalStore snapshot） */
  getVersion = () => this.version;

  /** 组件按 version 查询变更集（不可变，无竞争） */
  getChangedKeysForVersion = (sinceVersion: number): ReadonlySet<string> | 'all' => {
    if (sinceVersion >= this.version) return new Set();

    const cached = this.mergedCache.get(sinceVersion);
    if (cached !== undefined) return cached;

    const merged = new Set<string>();
    for (let v = sinceVersion + 1; v <= this.version; v++) {
      const snap = this.snapshots.get(v);
      if (!snap || snap === 'all') {
        this.mergedCache.set(sinceVersion, 'all');
        return 'all';
      }
      for (const k of snap) merged.add(k);
    }
    const result: ReadonlySet<string> = merged;
    this.mergedCache.set(sinceVersion, result);
    return result;
  };

  private addPendingKey(key: string) {
    if (this.pendingChangedKeys !== 'all') {
      this.pendingChangedKeys.add(key);
    }
  }

  private setPendingAll() {
    this.pendingChangedKeys = 'all';
  }

  private scheduleFlush() {
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush() {
    this.flushScheduled = false;

    const pending = this.pendingChangedKeys;
    if (pending !== 'all' && pending.size === 0) return;

    this.version++;
    const frozen: ReadonlySet<string> | 'all' = pending === 'all' ? 'all' : new Set(pending);
    this.snapshots.set(this.version, frozen);

    if (this.snapshots.size > EventDispatcher.MAX_SNAPSHOTS) {
      const oldest = this.version - EventDispatcher.MAX_SNAPSHOTS;
      for (const key of this.snapshots.keys()) {
        if (key <= oldest) this.snapshots.delete(key);
      }
    }

    this.pendingChangedKeys = new Set();
    this.mergedCache.clear();

    this.listeners.forEach((fn) => fn());
  }

  /**
   * 内部统一写入：更新 executionContext.data + 累积 pendingKey + scheduleFlush
   */
  private _writeComponentData(componentId: string, value: any) {
    const currentData = this.executionContext.data || {};
    this.executionContext = {
      ...this.executionContext,
      data: { ...currentData, [componentId]: value },
    };
    this.addPendingKey(componentId);
    this.scheduleFlush();
  }

  /**
   * 从 Redux store 回读组件数据并同步到 executionContext，保持双写路径一致性。
   * 返回 true 表示已成功回读并同步；false 表示无法从 store 读取。
   */
  private syncComponentDataFromStore(componentId: string): boolean {
    const state = this.getState?.();
    const storeData = state?.components?.data;
    if (!storeData || typeof storeData !== 'object') {
      return false;
    }

    const currentData = this.executionContext.data || {};
    const prevValue = currentData[componentId];
    const nextValue = (storeData as Record<string, any>)[componentId];

    if (!Object.is(prevValue, nextValue)) {
      this.executionContext = {
        ...this.executionContext,
        data: { ...currentData, [componentId]: nextValue },
      };
      this.addPendingKey(componentId);
      this.scheduleFlush();
    }

    return true;
  }

  /** 标记为全量变更（用于无法精确追踪的写入路径） */
  markFullChange = () => {
    this.setPendingAll();
    this.scheduleFlush();
  };

  /**
   * 更新执行上下文（不可变更新）
   */
  setContext(key: string, value: any) {
    this.context = { ...this.context, [key]: value };
    this.executionContext = { ...this.executionContext, [key]: value };
    this.setPendingAll();
    this.scheduleFlush();
  }

  /**
   * 更新组件数据到执行上下文（不可变更新）
   */
  updateComponentData(componentId: string, value: any) {
    this._writeComponentData(componentId, value);
  }

  /**
   * 执行 DSL Action 序列
   */
  async execute(actions: ActionList, event?: Event | any): Promise<any> {
    try {
      // 将事件对象添加到上下文
      const contextWithEvent: ExecutionContext = {
        ...this.executionContext,
        event,
      };

      // 执行DSL
      const result = await this.dslExecutor.execute(actions, contextWithEvent);
      return result;
    } catch (error) {
      console.error('[EventDispatcher] DSL execution failed:', error);
      throw error;
    }
  }

  /**
   * 创建事件处理器（同步版本，用于React事件绑定）
   */
  createHandler(actions: ActionList) {
    return (event: any) => {
      // 异步执行，不等待结果
      this.execute(actions, event).catch((error) => {
        console.error('[EventDispatcher] Handler execution failed:', error);
      });
    };
  }

  /**
   * 获取DSL执行引擎实例
   */
  getExecutor(): DSLExecutor {
    return this.dslExecutor;
  }

  /**
   * 获取当前执行上下文
   */
  getExecutionContext(): ExecutionContext {
    return this.executionContext;
  }
}
