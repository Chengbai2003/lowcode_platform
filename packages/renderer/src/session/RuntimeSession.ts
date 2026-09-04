import { EventDispatcher } from '../EventDispatcher';
import type { ReactiveRuntime } from '../reactive/runtime';
import type { ComputedLogicAnalysis, ActionFlowAnalysis } from '@lowcode-platform/schema-contract';
import {
  FlowRun,
  type FlowRunResult,
  type FlowExecutionLimits,
  FlowExecutionError,
  normalizeFlowExecutionLimits,
} from './FlowRun';

/**
 * RuntimeSession（Issue #19 / M0-4 Scope D, ADR-0003）
 *
 * 每次页面挂载创建独立 Session：Session 身份绑定 pageId + documentSessionId，
 * 独立持有 State/Computed（ReactiveRuntime）、执行栈（EventDispatcher）、
 * AbortController、timers、subscriptions 与 generation。
 *
 * dispose() 之后：
 * - 全部 session 内 timer 被清除、in-flight fetch 被 abort；
 * - 受控延迟（delay）与请求回调检测到 disposed 后不再写回任何状态；
 * - 旧 Session 的异步回调无法写回新页面（新页面持有全新 Session）。
 */

export interface RuntimeSessionIdentity {
  readonly pageId: string;
  readonly documentSessionId: string;
}

export interface RuntimeSessionOptions {
  pageId: string;
  documentSessionId: string;
  /** 复用既有执行栈（Renderer 集成路径）；缺省时 Session 自建 */
  dispatcher?: EventDispatcher;
  /** 自建执行栈时的初始上下文 */
  dispatcherInit?: Record<string, unknown>;
  /** 经 Schema Contract 验证并拓扑排序的 Computed 声明。 */
  computedAnalysis?: ComputedLogicAnalysis;
  /** 经 Schema Contract 验证与 DAG 分析的 ActionFlow 声明分析结果。 */
  flowAnalysis?: ActionFlowAnalysis;
  /** 运行时 Flow 执行预算（仅宿主配置，无法被 Schema 放宽）。 */
  flowExecutionLimits?: Partial<FlowExecutionLimits>;
}

export class RuntimeSession {
  readonly pageId: string;
  readonly documentSessionId: string;
  readonly dispatcher: EventDispatcher;
  readonly runtime: ReactiveRuntime;

  private readonly flowAnalysis?: ActionFlowAnalysis;
  private readonly flowLimits: FlowExecutionLimits;
  private readonly activeRootRuns = new Set<FlowRun>();

  private readonly controller = new AbortController();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly cleanups = new Set<() => void>();
  private disposed = false;
  private generationValue = 0;

  constructor(options: RuntimeSessionOptions) {
    const { pageId, documentSessionId } = options;
    if (typeof pageId !== 'string' || pageId.length === 0) {
      throw new Error('RuntimeSession: pageId must be a non-empty string');
    }
    if (typeof documentSessionId !== 'string' || documentSessionId.length === 0) {
      throw new Error('RuntimeSession: documentSessionId must be a non-empty string');
    }
    this.pageId = pageId;
    this.documentSessionId = documentSessionId;
    this.flowAnalysis = options.flowAnalysis;
    this.flowLimits = normalizeFlowExecutionLimits(options.flowExecutionLimits);
    this.dispatcher = options.dispatcher ?? new EventDispatcher(options.dispatcherInit ?? {});
    this.runtime = this.dispatcher.getRuntime();
    this.runtime.configureComputed(options.computedAnalysis, { notify: false });
    this.dispatcher.setHostConfig('session', this);
  }

  get identity(): RuntimeSessionIdentity {
    return Object.freeze({ pageId: this.pageId, documentSessionId: this.documentSessionId });
  }

  /** 本 Session 的 AbortSignal；dispose 后处于 aborted 状态 */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Session 代数：dispose 时递增；异步回调据此判断自己是否已过期 */
  get generation(): number {
    return this.generationValue;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generationValue;
  }

  throwIfDisposed(): void {
    if (this.disposed) {
      throw new Error(
        `RuntimeSession[${this.pageId}/${this.documentSessionId}] is disposed (fail-close)`,
      );
    }
  }

  /**
   * Session 内受控延迟：dispose 时 timer 被清除并 reject（AbortError）。
   */
  delay(ms: number): Promise<void> {
    this.throwIfDisposed();
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        this.timers.delete(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.controller.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      this.timers.add(timer);
      this.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * 登记 Session 自有的 timer：dispose 时统一清除；到点后仅在 Session
   * 仍存活时执行回调。
   */
  registerTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    this.throwIfDisposed();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) {
        callback();
      }
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  /**
   * Session 内受控 fetch：自动携带 Session AbortSignal。
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    this.throwIfDisposed();
    const signal = init?.signal
      ? AbortSignal.any([this.controller.signal, init.signal])
      : this.controller.signal;
    return fetch(input, { ...init, signal });
  }

  /**
   * 登记 Session 自有订阅/资源的清理函数；dispose 时统一执行。
   */
  trackCleanup(cleanup: () => void): void {
    this.throwIfDisposed();
    this.cleanups.add(cleanup);
  }

  /** 替换当前 Session 的 Computed 声明；现有 State 保持不变。 */
  configureComputed(analysis: ComputedLogicAnalysis | undefined): void {
    this.throwIfDisposed();
    this.runtime.configureComputed(analysis);
  }

  /**
   * 执行具名 ActionFlow（Issue #46 F2）。
   *
   * 每次调用创建独立的根 FlowRun 实例；嵌套 Flow 共享同一预算与 signal。
   */
  async executeFlow(flowId: string, input?: unknown): Promise<FlowRunResult> {
    if (this.disposed) {
      throw new FlowExecutionError({
        code: 'FLOW_ABORTED',
        flow: flowId,
        step: null,
        stepPath: [],
        path: ['logic', 'flows', flowId],
        trace: [{ flow: flowId, step: null }],
        message: 'RuntimeSession is disposed',
      });
    }

    if (!this.flowAnalysis || !this.flowAnalysis.flows || !this.flowAnalysis.flows[flowId]) {
      throw new FlowExecutionError({
        code: 'FLOW_NOT_FOUND',
        flow: flowId,
        step: null,
        stepPath: [],
        path: ['logic', 'flows', flowId],
        trace: [{ flow: flowId, step: null }],
        message: `Flow not found: "${flowId}"`,
      });
    }

    if (this.activeRootRuns.size >= this.flowLimits.maxConcurrentRuns) {
      throw new FlowExecutionError({
        code: 'FLOW_CONCURRENCY_EXCEEDED',
        flow: flowId,
        step: null,
        stepPath: [],
        path: ['logic', 'flows', flowId],
        trace: [{ flow: flowId, step: null }],
        message: `Flow concurrency exceeded: maximum ${this.flowLimits.maxConcurrentRuns} concurrent runs allowed`,
      });
    }

    const flowRun = new FlowRun(this, this.flowAnalysis, this.flowLimits);
    this.activeRootRuns.add(flowRun);
    try {
      return await flowRun.execute(flowId, input);
    } finally {
      this.activeRootRuns.delete(flowRun);
    }
  }

  /**
   * 销毁 Session：清除 timers、执行 cleanups、abort 全部 in-flight 请求。
   * 幂等；dispose 后旧异步回调不得再写回状态（见 asyncActions 守卫）。
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generationValue += 1;

    for (const run of this.activeRootRuns) {
      run.abort();
    }
    this.activeRootRuns.clear();

    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[RuntimeSession] cleanup failed:', error);
      }
    }
    this.cleanups.clear();

    this.runtime.clearComputed({ notify: false });
    this.controller.abort();
  }
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('RuntimeSession disposed', 'AbortError');
  }
  const error = new Error('RuntimeSession disposed');
  error.name = 'AbortError';
  return error;
}

/**
 * 纯工厂：每次调用返回全新独立 Session（不共享任何全局状态）。
 * Renderer 每次页面挂载由 useMemo 自建，并在卸载/换页时 dispose。
 */
export function createRuntimeSession(options: RuntimeSessionOptions): RuntimeSession {
  return new RuntimeSession(options);
}

/**
 * 宿主级 Session 管理器：每个宿主实例可自建独立的会话管理器，
 * 绝不使用跨 Host / 跨应用的全局可变单例。
 */
export class RuntimeSessionManager {
  private readonly sessions = new Map<string, RuntimeSession>();

  getOrCreate(options: RuntimeSessionOptions): RuntimeSession {
    const { pageId, documentSessionId } = options;
    const existing = this.sessions.get(pageId);
    if (existing && !existing.isDisposed() && existing.documentSessionId === documentSessionId) {
      return existing;
    }
    existing?.dispose();
    const session = new RuntimeSession(options);
    this.sessions.set(pageId, session);
    return session;
  }

  dispose(pageId: string): void {
    const existing = this.sessions.get(pageId);
    if (existing) {
      existing.dispose();
      this.sessions.delete(pageId);
    }
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
}

export function createRuntimeSessionManager(): RuntimeSessionManager {
  return new RuntimeSessionManager();
}
