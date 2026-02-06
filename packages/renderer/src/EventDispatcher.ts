/**
 * @fileoverview 安全的事件派发中心
 *
 * 使用 SecureSandbox 执行用户代码，彻底隔离 XSS 攻击
 *
 * 核心改进：
 * 1. 使用 QuickJS 创建完全隔离的 JavaScript 执行环境
 * 2. 禁止访问 DOM、window、document 等浏览器 API
 * 3. 仅暴露白名单 API（dispatch、getState、console 等）
 * 4. 所有代码执行都是异步的，防止阻塞主线程
 *
 * @security QuickJS 沙箱确保用户代码无法访问宿主环境
 * @author Lowcode Platform Team
 * @version 2.0.0
 */

import { SecureSandbox, SandboxConfig, ExecutionResult } from './SecureSandbox';

/**
 * 事件处理器类型
 */
export type EventHandler = string | string[] | ((event?: unknown, ...args: unknown[]) => unknown);

/**
 * 安全事件派发器配置
 */
export interface SafeEventDispatcherConfig {
  /** 沙箱配置 */
  sandbox?: SandboxConfig;
  /** 自定义上下文 */
  context?: Record<string, unknown>;
  /** 是否在执行失败时抛出错误 */
  throwOnError?: boolean;
}

/**
 * 执行上下文
 */
interface ExecutionContext {
  event?: unknown;
  args: unknown[];
  context: Record<string, unknown>;
}

/**
 * 安全的事件派发器
 *
 * 使用 QuickJS 沙箱执行用户代码，完全隔离 XSS 攻击
 */
export class SafeEventDispatcher {
  private sandbox: SecureSandbox;
  private config: Required<SafeEventDispatcherConfig>;
  private context: Record<string, unknown>;
  private dispatch: (action: unknown) => void;
  private getState: () => unknown;

  constructor(
    dispatch: (action: unknown) => void,
    getState: () => unknown,
    config: SafeEventDispatcherConfig = {}
  ) {
    this.dispatch = dispatch;
    this.getState = getState;
    this.config = {
      sandbox: {},
      context: {},
      throwOnError: false,
      ...config,
    };
    this.context = this.config.context;

    // 创建沙箱实例
    this.sandbox = new SecureSandbox(dispatch, getState, this.config.sandbox);
  }

  /**
   * 初始化沙箱
   */
  async initialize(): Promise<void> {
    await this.sandbox.initialize();
  }

  /**
   * 更新执行上下文
   */
  setContext(key: string, value: unknown): void {
    this.context[key] = value;
    // 注意：QuickJS 的上下文是隔离的，动态更新需要重新注入
  }

  /**
   * 获取完整上下文
   */
  getContext(): Record<string, unknown> {
    return {
      ...this.context,
      dispatch: this.dispatch,
      getState: this.getState,
    };
  }

  /**
   * 构建执行代码
   */
  private buildExecutionCode(code: string, ctx: ExecutionContext): string {
    const { event, args, context } = ctx;

    // 构建上下文变量注入
    const contextVars = Object.entries(context)
      .map(([key, value]) => {
        try {
          return `const ${key} = ${JSON.stringify(value)};`;
        } catch {
          return `// Failed to serialize ${key}`;
        }
      })
      .join('\n');

    // 构建额外参数
    const argsVars = args
      .map((arg, i) => `const arg${i} = ${JSON.stringify(arg)};`)
      .join('\n');

    // 构建事件变量
    const eventVar = event !== undefined
      ? `const event = ${JSON.stringify(event)};`
      : 'const event = undefined;';

    return `
      ${contextVars}
      ${eventVar}
      ${argsVars}

      // 沙箱中可用的内置函数
      const console = {
        log: (...args) => __console_log(...args),
        info: (...args) => __console_info(...args),
        warn: (...args) => __console_warn(...args),
        error: (...args) => __console_error(...args),
      };

      ${code}
    `;
  }

  /**
   * 执行单个代码片段
   */
  private async executeSingle(
    code: string,
    event?: unknown,
    extraArgs: unknown[] = []
  ): Promise<ExecutionResult> {
    const ctx: ExecutionContext = {
      event,
      args: extraArgs,
      context: this.getContext(),
    };

    const wrappedCode = this.buildExecutionCode(code, ctx);

    return this.sandbox.execute(wrappedCode);
  }

  /**
   * 执行事件代码
   */
  async execute(
    code: string | string[],
    event?: unknown,
    ...extraArgs: unknown[]
  ): Promise<ExecutionResult | ExecutionResult[]> {
    try {
      if (Array.isArray(code)) {
        // 链式执行多个代码片段
        const results: ExecutionResult[] = [];

        for (const snippet of code) {
          const result = await this.executeSingle(snippet, event, extraArgs);
          results.push(result);

          // 如果某个片段执行失败，中断链式执行
          if (!result.success) {
            // eslint-disable-next-line no-console
            console.error('Chain execution interrupted due to error:', snippet);
            break;
          }
        }

        return results;
      }

      // 执行单个代码片段
      return this.executeSingle(code, event, extraArgs);
    } catch (error) {
      const errorResult: ExecutionResult = {
        success: false,
        error: `Event Execution System Error: ${String(error)}`,
        duration: 0,
      };

      if (this.config.throwOnError) {
        throw error;
      }

      return errorResult;
    }
  }

  /**
   * 创建事件处理器
   */
  createHandler(code: string | string[]) {
    return async (event?: unknown, ...extraArgs: unknown[]) => {
      const result = await this.execute(code, event, ...extraArgs);

      if (Array.isArray(result)) {
        // 返回最后一个成功的结果
        const lastSuccess = [...result].reverse().find((r) => r.success);
        return lastSuccess?.value;
      }

      return result.success ? result.value : undefined;
    };
  }

  /**
   * 销毁沙箱，释放资源
   */
  destroy(): void {
    this.sandbox.destroy();
  }
}

// 为了向后兼容，也导出 EventDispatcher 作为别名
export { SafeEventDispatcher as EventDispatcher };
export default SafeEventDispatcher;
