/**
 * 事件派发中心
 * 负责解析和执行 DSL Action 序列
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DSLExecutor } from './executor';
import type { ActionList, ExecutionContext } from '../types';
import { ReactiveRuntime } from './reactive/runtime';

/**
 * 事件派发中心类
 */
export class EventDispatcher {
  private context: Record<string, any>;
  private dslExecutor: DSLExecutor;
  private executionContext: ExecutionContext;
  private runtime: ReactiveRuntime;

  constructor(context: Record<string, any> = {}, dispatch?: any, getState?: any) {
    this.context = context;

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
      ...context,
      dispatch: dispatch ?? context.dispatch,
      getState: getState ?? context.getState,
    });
    this.runtime = this.executionContext.runtime;
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

  private readNamespaceContextValue(key: string): unknown {
    switch (key) {
      case 'data':
        return this.runtime.getData();
      case 'state':
        return this.runtime.getState();
      case 'formData':
        return this.runtime.getFormData();
      case 'components':
        return this.runtime.getComponents();
      default:
        return this.executionContext[key];
    }
  }

  markFullChange = () => {
    this.runtime.markAllDirty();
  };

  /**
   * 更新执行上下文（不可变更新）
   */
  setContext(key: string, value: any) {
    const currentValue = this.readNamespaceContextValue(key);
    if (Object.is(currentValue, value)) {
      return;
    }

    if (
      (key === 'data' || key === 'state' || key === 'formData' || key === 'components') &&
      value &&
      typeof value === 'object' &&
      this.isShallowEqualRecord(currentValue, value as Record<string, unknown>)
    ) {
      return;
    }

    this.context = { ...this.context, [key]: value };

    if (key === 'data' || key === 'state' || key === 'formData') {
      if (typeof value === 'object' && value !== null) {
        this.runtime.setNamespace(key, value as Record<string, unknown>);
      }
      return;
    }

    if (key === 'components' && typeof value === 'object' && value !== null) {
      this.runtime.setComponents(value as Record<string, unknown>);
      return;
    }

    this.executionContext = { ...this.executionContext, [key]: value };
    this.runtime.markAllDirty();
  }

  updateComponentData(componentId: string, value: any) {
    this.runtime.set(componentId, value);
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
