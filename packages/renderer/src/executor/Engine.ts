/**
 * DSL执行引擎
 * 负责解析和执行DSL Action序列
 */

import type {
  Action,
  ActionList,
  ExecutionContext,
  ActionHandler,
  ActionRegistry,
  ExecutorOptions,
  ActionResult,
  BatchActionResult,
} from '../types/dsl';
import dataActions from './actions/dataActions';
import uiActions from './actions/uiActions';
import navActions from './actions/navActions';
import stateActions from './actions/stateActions';
import flowActions from './actions/flowActions';
import asyncActions from './actions/asyncActions';
import debugActions from './actions/debugActions';

/**
 * 内置Action处理器
 */
const BUILTIN_HANDLERS: ActionRegistry = {
  // 数据操作
  setField: dataActions.setField,
  mergeField: dataActions.mergeField,
  clearField: dataActions.clearField,

  // UI交互
  message: uiActions.message,
  modal: uiActions.modal,
  confirm: uiActions.confirm,
  notification: uiActions.notification,

  // 导航
  navigate: navActions.navigate,
  openTab: navActions.openTab,
  closeTab: navActions.closeTab,
  back: navActions.back,

  // 状态管理
  dispatch: stateActions.dispatch,
  setState: stateActions.setState,
  resetForm: stateActions.resetForm,

  // 异步操作
  apiCall: asyncActions.apiCall,
  delay: asyncActions.delay,
  waitCondition: asyncActions.waitCondition,

  // 流程控制
  if: flowActions.if,
  switch: flowActions.switch,
  loop: flowActions.loop,
  parallel: flowActions.parallel,
  sequence: flowActions.sequence,
  tryCatch: flowActions.tryCatch,

  // 调试
  log: debugActions.log,
  debug: debugActions.debug,
};

/**
 * DSL执行引擎类
 */
export class DSLExecutor {
  private handlers: ActionRegistry;
  private options: Required<ExecutorOptions>;
  private executionId = 0;

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      maxExecutionTime: options.maxExecutionTime ?? 30000,
      enableCustomScript: options.enableCustomScript ?? false,
      enablePlugins: options.enablePlugins ?? false,
      customHandlers: options.customHandlers ?? {},
      onError: options.onError ?? (() => {}),
      onLog: options.onLog ?? ((level, message, data) => {
        console[level as keyof Console](`[DSL ${level.toUpperCase()}]`, message, data ?? '');
      }),
    };

    // 合并处理器：内置 + 自定义
    this.handlers = {
      ...BUILTIN_HANDLERS,
      ...this.options.customHandlers,
    };
  }

  /**
   * 执行Action列表
   */
  async execute(actions: ActionList, context: ExecutionContext): Promise<BatchActionResult> {
    const startTime = Date.now();

    // 将 onLog 方法注入到上下文中，供 debugActions 使用
    const contextWithLog = {
      ...context,
      onLog: this.options.onLog,
    };
    const id = ++this.executionId;

    this.log('info', `Starting execution #${id} with ${actions.length} actions`);

    const results: ActionResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionStart = Date.now();

      try {
        const result = await this.executeSingle(action, contextWithLog);
        const duration = Date.now() - actionStart;

        results.push({
          success: true,
          value: result,
          duration,
        });

        successCount++;

        if (this.options.debug) {
          this.log('debug', `Action ${i + 1}/${actions.length} executed in ${duration}ms`, action);
        }
      } catch (error) {
        const duration = Date.now() - actionStart;
        const errorObj = error instanceof Error ? error : new Error(String(error));

        results.push({
          success: false,
          error: errorObj,
          duration,
        });

        failedCount++;

        this.options.onError(errorObj, action, contextWithLog);

        // 记录错误
        this.log('error', `Action ${i + 1}/${actions.length} failed: ${errorObj.message}`, {
          action,
          error: errorObj,
        });

        // 是否继续执行后续Action？
        // 默认：继续执行，除非是tryCatch块内部
        // 可以通过配置来改变行为
      }
    }

    const duration = Date.now() - startTime;

    this.log('info', `Execution #${id} completed: ${successCount} success, ${failedCount} failed, ${duration}ms total`);

    return {
      total: actions.length,
      success: successCount,
      failed: failedCount,
      results,
      duration,
    };
  }

  /**
   * 执行单个Action
   */
  async executeSingle(action: Action, context: ExecutionContext): Promise<any> {
    const actionType = action.type;

    // 检查执行超时
    if (this.options.maxExecutionTime > 0) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Action execution timeout (${this.options.maxExecutionTime}ms)`));
        }, this.options.maxExecutionTime);
      });

      const executionPromise = this._executeAction(action, context);

      return Promise.race([executionPromise, timeoutPromise]);
    }

    return this._executeAction(action, context);
  }

  /**
   * 内部Action执行逻辑
   */
  private async _executeAction(action: Action, context: ExecutionContext): Promise<any> {
    const actionType = action.type;
    const handler = this.handlers[actionType];

    if (!handler) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    // 调用处理器，传入引擎实例（用于嵌套调用）
    return handler(action, context, this);
  }

  /**
   * 注册自定义Action处理器
   */
  registerHandler(type: string, handler: ActionHandler): void {
    this.handlers[type] = handler;
    this.log('info', `Registered custom handler: ${type}`);
  }

  /**
   * 批量注册Action处理器
   */
  registerHandlers(handlers: ActionRegistry): void {
    Object.assign(this.handlers, handlers);
    this.log('info', `Registered ${Object.keys(handlers).length} custom handlers`);
  }

  /**
   * 获取已注册的处理器列表
   */
  getRegisteredHandlers(): string[] {
    return Object.keys(this.handlers);
  }

  /**
   * 检查Action类型是否已注册
   */
  hasHandler(type: string): boolean {
    return type in this.handlers;
  }

  /**
   * 日志输出
   */
  private log(level: 'log' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (this.options.debug || level === 'error') {
      this.options.onLog(level, message, data);
    }
  }

  /**
   * 创建一个新的执行上下文
   */
  static createContext(baseContext: Partial<ExecutionContext>): ExecutionContext {
    return {
      data: {},
      formData: {},
      user: { id: '', name: '', roles: [], permissions: [] },
      route: { path: '', query: {}, params: {} },
      state: {},
      dispatch: () => {},
      getState: () => ({}),
      utils: {
        formatDate: (date: Date | string, format = 'YYYY-MM-DD') => {
          // 简化实现
          return String(date);
        },
        uuid: () => {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        },
        clone: <T>(obj: T): T => {
          return JSON.parse(JSON.stringify(obj));
        },
        debounce: <T extends (...args: any[]) => any>(fn: T, delay: number): T => {
          let timeout: any;
          return ((...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
          }) as T;
        },
        throttle: <T extends (...args: any[]) => any>(fn: T, delay: number): T => {
          let lastCall = 0;
          return ((...args: any[]) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
              lastCall = now;
              fn(...args);
            }
          }) as T;
        },
      },
      ui: {
        message: {
          success: () => {},
          error: () => {},
          warning: () => {},
          info: () => {},
        },
        modal: {
          confirm: () => Promise.resolve(false),
          info: () => Promise.resolve(),
          success: () => Promise.resolve(),
          error: () => Promise.resolve(),
          warning: () => Promise.resolve(),
        },
        notification: {
          success: () => {},
          error: () => {},
          warning: () => {},
          info: () => {},
        },
      },
      api: {
        get: () => Promise.resolve({}),
        post: () => Promise.resolve({}),
        put: () => Promise.resolve({}),
        delete: () => Promise.resolve({}),
        request: () => Promise.resolve({}),
      },
      navigate: () => {},
      back: () => {},
      ...baseContext,
    };
  }
}

/**
 * 导出
 */
export default DSLExecutor;

/**
 * 导出内置处理器
 */
export const builtinHandlers = BUILTIN_HANDLERS;
