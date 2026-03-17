/**
 * 事件派发中心
 * 负责解析和执行 DSL Action 序列
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DSLExecutor } from './executor';
import type { ActionList, ExecutionContext } from '../types';
import {
  selectCompatibilityComponentData,
  setCompatibilityComponentConfig,
  setCompatibilityComponentData,
  setCompatibilityMultipleComponentData,
} from './store/compat';
import { ReactiveRuntime } from './reactive/runtime';

const noopDispatch = () => {};
const noopGetState = () => undefined;

/**
 * 事件派发中心类
 */
export class EventDispatcher {
  private context: Record<string, any>;
  private dispatch: any;
  private getState: any;
  private dslExecutor: DSLExecutor;
  private executionContext: ExecutionContext;
  private runtime: ReactiveRuntime;

  constructor(context: Record<string, any> = {}, dispatch?: any, getState?: any) {
    this.context = context;
    this.dispatch = dispatch ?? noopDispatch;
    this.getState = getState ?? noopGetState;
    this.runtime = new ReactiveRuntime();

    this.dslExecutor = new DSLExecutor({
      debug: process.env.NODE_ENV !== 'production',
      enableCustomScript: context.enableCustomScript ?? true,
      onError: (error, action) => {
        console.error('[DSL Error]', error.message, { action });
      },
      onLog: (level, message, data) => {
        (console as any)[level](`[DSL ${level}]`, message, data);
      },
    });

    this.executionContext = DSLExecutor.createContext({
      dispatch: this.dispatch,
      getState: this.getState,
      data: {},
      formData: {},
      setComponentData: (id: string, value: any) => {
        let dispatchError: unknown;
        try {
          this.dispatch(setCompatibilityComponentData({ id, value }));
        } catch (error) {
          dispatchError = error;
        }

        const syncedFromStore = this.syncComponentDataFromStore(id);
        if (!syncedFromStore && dispatchError == null) {
          this._writeComponentData(id, value);
        }

        if (dispatchError) {
          throw dispatchError;
        }
      },
      setComponentConfig: (id: string, config: any) => {
        this.dispatch(setCompatibilityComponentConfig({ id, config }));
      },
      markFullChange: () => this.markFullChange(),
      ...this.context,
    });

    this.runtime.initialize({
      data:
        this.executionContext.data && typeof this.executionContext.data === 'object'
          ? (this.executionContext.data as Record<string, unknown>)
          : undefined,
      state:
        this.executionContext.state && typeof this.executionContext.state === 'object'
          ? (this.executionContext.state as Record<string, unknown>)
          : undefined,
      formData:
        this.executionContext.formData && typeof this.executionContext.formData === 'object'
          ? (this.executionContext.formData as Record<string, unknown>)
          : undefined,
      components:
        this.executionContext.components && typeof this.executionContext.components === 'object'
          ? (this.executionContext.components as Record<string, unknown>)
          : undefined,
    });

    this.runtime.subscribe(() => {
      this.syncCompatibilityStateFromRuntime();
    });
  }

  subscribe = (listener: () => void) => {
    return this.runtime.subscribe(listener);
  };

  getVersion = () => {
    return this.runtime.getVersion();
  };

  getChangedKeysForVersion = (sinceVersion: number): ReadonlySet<string> | 'all' => {
    const dirtyPaths = this.runtime.getDirtyPaths(sinceVersion);
    if (dirtyPaths === 'all') return 'all';

    const result = new Set<string>();
    for (const path of dirtyPaths) {
      if (path.startsWith('data.')) {
        result.add(path.slice(5));
      } else {
        result.add(path);
      }
    }
    return result;
  };

  /**
   * 将 runtime 的稳定结果镜像回 executionContext / Redux 兼容层。
   */
  private syncCompatibilityStateFromRuntime() {
    const nextData = { ...this.runtime.getData() };
    const nextState = { ...this.runtime.getState() };
    const nextFormData = { ...this.runtime.getFormData() };
    const nextComponents = { ...this.runtime.getComponents() };

    this.executionContext = {
      ...this.executionContext,
      data: nextData,
      state: nextState,
      formData: nextFormData,
      components: nextComponents,
    };

    const storeData = selectCompatibilityComponentData(this.getState?.());
    if (this.isShallowEqualRecord(storeData, nextData)) {
      return;
    }

    try {
      this.dispatch(setCompatibilityMultipleComponentData(nextData));
    } catch (error) {
      console.warn('[EventDispatcher] Failed to mirror runtime snapshot to Redux bridge', {
        error,
      });
    }
  }

  private isShallowEqualRecord(
    left: unknown,
    right: Record<string, unknown>,
  ): left is Record<string, unknown> {
    if (!left || typeof left !== 'object') {
      return false;
    }

    const leftRecord = left as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of rightKeys) {
      if (!Object.is(leftRecord[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 内部统一写入：更新 executionContext.data，并写入 ReactiveRuntime。
   */
  private _writeComponentData(componentId: string, value: any) {
    const currentData = this.executionContext.data || {};
    this.executionContext = {
      ...this.executionContext,
      data: { ...currentData, [componentId]: value },
    };

    this.runtime.set(componentId, value);

    try {
      this.dispatch(setCompatibilityComponentData({ id: componentId, value }));
    } catch (error) {
      console.warn('[EventDispatcher] Failed to mirror runtime write to Redux bridge', {
        componentId,
        error,
      });
    }
  }

  /**
   * 从 Redux store 回读组件数据并同步到 executionContext / runtime。
   * 返回 true 表示已成功回读并同步；false 表示无法从 store 读取。
   */
  private syncComponentDataFromStore(componentId: string): boolean {
    const state = this.getState?.();
    const storeData = selectCompatibilityComponentData(state);
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

      this.runtime.set(componentId, nextValue);
    }

    return true;
  }

  markFullChange = () => {
    this.runtime.markAllDirty();
  };

  /**
   * 更新执行上下文（不可变更新）
   */
  setContext(key: string, value: any) {
    if (Object.is(this.executionContext[key], value)) {
      return;
    }

    if (
      (key === 'data' || key === 'state' || key === 'formData' || key === 'components') &&
      value &&
      typeof value === 'object' &&
      this.isShallowEqualRecord(this.executionContext[key], value as Record<string, unknown>)
    ) {
      return;
    }

    this.context = { ...this.context, [key]: value };
    this.executionContext = { ...this.executionContext, [key]: value };

    if (key === 'data' || key === 'state' || key === 'formData') {
      if (typeof value === 'object' && value !== null) {
        this.runtime.setNamespace(key, value as Record<string, unknown>);
        return;
      }
    }

    if (key === 'components' && typeof value === 'object' && value !== null) {
      this.runtime.setComponents(value as Record<string, unknown>);
      return;
    }

    this.runtime.markAllDirty();
  }

  updateComponentData(componentId: string, value: any) {
    this._writeComponentData(componentId, value);
  }

  async execute(
    actions: ActionList,
    event?: Event | any,
    extraContext: Record<string, unknown> = {},
  ): Promise<any> {
    try {
      const contextWithEvent: ExecutionContext = {
        ...this.getExecutionContext(),
        ...extraContext,
        event,
      };

      return await this.dslExecutor.execute(actions, contextWithEvent);
    } catch (error) {
      console.error('[EventDispatcher] DSL execution failed:', error);
      throw error;
    }
  }

  createHandler(actions: ActionList) {
    return (event: any) => {
      this.execute(actions, event).catch((error) => {
        console.error('[EventDispatcher] Handler execution failed:', error);
      });
    };
  }

  getExecutor(): DSLExecutor {
    return this.dslExecutor;
  }

  getExecutionContext(): ExecutionContext {
    return {
      ...this.executionContext,
      data: { ...this.runtime.getData() },
      state: { ...this.runtime.getState() },
      formData: { ...this.runtime.getFormData() },
      components: { ...this.runtime.getComponents() },
      runtime: this.runtime,
    };
  }

  getRuntime(): ReactiveRuntime {
    return this.runtime;
  }
}
