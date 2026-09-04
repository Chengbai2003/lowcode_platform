// eslint-disable @typescript-eslint/no-explicit-any
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
} from '../dsl';
import dataActions from './actions/dataActions';
import uiActions from './actions/uiActions';
import navActions from './actions/navActions';
import flowActions from './actions/flowActions';
import asyncActions from './actions/asyncActions';
import debugActions from './actions/debugActions';
import { ReactiveRuntime } from '../reactive/runtime';
import { buildNavigationTarget } from '../utils/sanitizeUrl';
import { getFlowRunContext, FLOW_RUN_CONTEXT, FlowExecutionError } from '../session/FlowRun';

/**
 * 内置Action处理器 (8种精简方案 + Flow 运行动作)
 *
 * | 分类 | Action | 用途 |
 * |-----|--------|------|
 * | 数据 | setValue | 设置字段/状态值 |
 * | 网络 | apiCall | API 请求 |
 * | 路由 | navigate | 页面跳转 |
 * | 交互 | feedback | 消息/通知 |
 * | 弹窗 | dialog | 模态框/确认框 |
 * | 控制 | if, loop, runFlow | 条件分支/循环/流程调度 |
 * | 工具 | delay, log | 延迟/日志 |
 */
const BUILTIN_HANDLERS: ActionRegistry = {
  // 数据
  setValue: dataActions.setValue,

  // 网络
  apiCall: asyncActions.apiCall,

  // 路由
  navigate: navActions.navigate,

  // 交互
  feedback: uiActions.feedback,

  // 弹窗
  dialog: uiActions.dialog,

  // 流程控制
  if: flowActions.if,
  loop: flowActions.loop,
  runFlow: flowActions.runFlow,

  // 工具
  delay: asyncActions.delay,
  log: debugActions.log,
};

function assertRegistrableActionType(type: string): void {
  if (type === 'customScript') {
    throw new Error('customScript is permanently disabled: in-realm execution is unsafe');
  }
}

/**
 * DSL执行引擎类
 */
export class DSLExecutor {
  private handlers: ActionRegistry;
  private options: Required<ExecutorOptions>;
  private executionId = 0;

  constructor(options: ExecutorOptions = {}) {
    if (options.customHandlers) {
      for (const type of Object.keys(options.customHandlers)) {
        assertRegistrableActionType(type);
      }
    }
    this.options = {
      debug: options.debug ?? false,
      maxExecutionTime: options.maxExecutionTime ?? 30000,
      enablePlugins: options.enablePlugins ?? false,
      customHandlers: options.customHandlers ?? {},
      onError: options.onError ?? (() => {}),
      onLog:
        options.onLog ??
        ((level, message, data) => {
          (console as any)[level](`[DSL ${level.toUpperCase()}]`, message, data ?? '');
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

    // 将 onLog 方法注入到上下文中
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
          this.log('info', `Action ${i + 1}/${actions.length} executed in ${duration}ms`, action);
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

        this.log('error', `Action ${i + 1}/${actions.length} failed: ${errorObj.message}`, {
          action,
          error: errorObj,
        });

        // Flow 模式严格停止
        if (getFlowRunContext(context)) {
          throw errorObj;
        }
      }
    }

    const duration = Date.now() - startTime;

    this.log(
      'info',
      `Execution #${id} completed: ${successCount} success, ${failedCount} failed, ${duration}ms total`,
    );

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
    const flowContext = getFlowRunContext(context);
    // Flow 模式不要叠加旧的 per-action timeout
    if (flowContext) {
      return this._executeAction(action, context);
    }

    // 检查执行超时（Legacy 模式；并在 Promise settle 后清除 timer，杜绝泄漏）
    if (this.options.maxExecutionTime > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Action execution timeout (${this.options.maxExecutionTime}ms)`));
        }, this.options.maxExecutionTime);
      });

      const executionPromise = this._executeAction(action, context);

      try {
        return await Promise.race([executionPromise, timeoutPromise]);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    }

    return this._executeAction(action, context);
  }

  /**
   * 内部Action执行逻辑
   */
  private async _executeAction(action: Action, context: ExecutionContext): Promise<any> {
    const flowContext = getFlowRunContext(context);
    const actionType = action.type as string;

    if (actionType === 'customScript') {
      if (flowContext) {
        throw flowContext.flowRun.createError(
          'FLOW_UNSUPPORTED_STEP',
          flowContext.flowKey,
          flowContext.topStepIndex,
          flowContext.stepPath,
          'customScript is unavailable because in-realm execution is unsafe',
        );
      }
      // 历史类型已从 Schema 联合移除；此处兜底拦截，防止任何残留输入被执行
      throw new Error('customScript is unavailable because in-realm execution is unsafe');
    }

    const handler = this.handlers[actionType as Action['type']];

    if (!handler) {
      if (flowContext) {
        throw flowContext.flowRun.createError(
          'FLOW_UNSUPPORTED_STEP',
          flowContext.flowKey,
          flowContext.topStepIndex,
          flowContext.stepPath,
          `Unknown action type: ${actionType}`,
        );
      }
      throw new Error(`Unknown action type: ${actionType}`);
    }

    if (flowContext) {
      flowContext.flowRun.incrementActionCount(flowContext, action);
    }

    const liveContext: ExecutionContext = {
      ...context,
      data: context.runtime.getData(),
      state: context.runtime.getState(),
      computed: context.runtime.getComputed(),
      formData: context.runtime.getFormData(),
      components: context.runtime.getComponents(),
      ...(flowContext ? { [FLOW_RUN_CONTEXT]: flowContext } : {}),
    };
    try {
      return await handler(action, liveContext, this);
    } catch (err) {
      if (flowContext) {
        if (err instanceof FlowExecutionError) {
          throw err;
        }
        throw flowContext.flowRun.createError(
          'FLOW_STEP_FAILED',
          flowContext.flowKey,
          flowContext.topStepIndex,
          flowContext.stepPath,
          err instanceof Error ? err.message : String(err),
          err,
        );
      }
      throw err;
    }
  }

  /**
   * 注册自定义Action处理器
   */
  registerHandler(type: string, handler: ActionHandler): void {
    assertRegistrableActionType(type);
    this.handlers[type] = handler;
    this.log('info', `Registered custom handler: ${type}`);
  }

  /**
   * 批量注册Action处理器
   */
  registerHandlers(handlers: ActionRegistry): void {
    for (const type of Object.keys(handlers)) {
      assertRegistrableActionType(type);
    }
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
  static createContext(baseContext: Partial<ExecutionContext> = {}): ExecutionContext {
    const runtime = baseContext.runtime ?? new ReactiveRuntime();

    if (baseContext.runtime) {
      if (baseContext.data && !runtime.hasNamespaceData('data')) {
        runtime.setNamespace('data', baseContext.data, { notify: false });
      }
      if (baseContext.state && !runtime.hasNamespaceData('state')) {
        runtime.setNamespace('state', baseContext.state, { notify: false });
      }
      if (baseContext.formData && !runtime.hasNamespaceData('formData')) {
        runtime.setNamespace('formData', baseContext.formData, { notify: false });
      }
      if (baseContext.components && !runtime.hasComponents()) {
        runtime.setComponents(baseContext.components, { notify: false });
      }
    } else {
      runtime.initialize({
        data: baseContext.data,
        state: baseContext.state,
        formData: baseContext.formData,
        components: baseContext.components,
      });
    }

    const {
      data: _data,
      formData: _formData,
      state: _state,
      computed: _computed,
      components: _components,
      runtime: _runtime,
      user,
      route,
      utils,
      ui,
      api,
      navigate,
      back,
      ...restContext
    } = baseContext;

    const defaultUtils = {
      formatDate: (date: Date | string, _format = 'YYYY-MM-DD') => {
        return String(date);
      },
      uuid: () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
    };

    const defaultUi = {
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
    };

    const defaultApi = {
      get: <T = any>() => Promise.resolve({} as T),
      post: <T = any>() => Promise.resolve({} as T),
      put: <T = any>() => Promise.resolve({} as T),
      delete: <T = any>() => Promise.resolve({} as T),
      request: <T = any>() => Promise.resolve({} as T),
    };

    const rawNavigate = navigate as unknown as
      | ((path: string, params?: Record<string, unknown>) => void)
      | undefined;
    // M0-4 Scope E：宿主未注入 navigate 时默认 deny（fail-close），
    // 内置 window 回退另行受 hostCapabilities.navigation 门控
    const baseNavigate =
      rawNavigate ??
      (() => {
        throw new Error(
          'Host capability denied: "navigation" — inject context.navigate to enable navigation',
        );
      });
    const safeNavigate = (path: unknown, params?: Record<string, unknown>) =>
      (baseNavigate as (p: string) => void)(buildNavigationTarget(path, params));

    return {
      ...restContext,
      user: user ?? { id: '', name: '', roles: [], permissions: [] },
      route: route ?? { path: '', query: {}, params: {} },
      dispatch: baseContext.dispatch,
      getState: baseContext.getState,
      utils: utils ?? defaultUtils,
      ui: ui ?? defaultUi,
      api: api ?? defaultApi,
      navigate: safeNavigate as unknown as ExecutionContext['navigate'],
      back: back ?? (() => {}),
      data: runtime.getData(),
      formData: runtime.getFormData(),
      state: runtime.getState(),
      computed: runtime.getComputed(),
      components: runtime.getComponents(),
      runtime,
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
