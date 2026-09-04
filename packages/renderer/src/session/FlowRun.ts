import type { ActionFlowAnalysis } from '@lowcode-platform/schema-contract';
import type { Action, ActionList, ExecutionContext } from '../dsl';
import type { DSLExecutor } from '../executor/Engine';
import type { RuntimeSession } from './RuntimeSession';

/**
 * 运行时预算配置（Issue #46 F2）
 * 只能由 RuntimeSession 宿主配置，Schema 不能修改。
 */
export interface FlowExecutionLimits {
  readonly maxExecutedActions: number;
  readonly maxLoopIterations: number;
  readonly maxFlowDepth: number;
  readonly maxConcurrentRuns: number;
  readonly maxDurationMs: number;
}

export const DEFAULT_FLOW_EXECUTION_LIMITS: FlowExecutionLimits = Object.freeze({
  maxExecutedActions: 200,
  maxLoopIterations: 200,
  maxFlowDepth: 16,
  maxConcurrentRuns: 8,
  maxDurationMs: 30000,
});

export const HARD_FLOW_EXECUTION_LIMITS: FlowExecutionLimits = Object.freeze({
  maxExecutedActions: 100000,
  maxLoopIterations: 100000,
  maxFlowDepth: 64,
  maxConcurrentRuns: 128,
  maxDurationMs: 300000,
});

/**
 * 校验并规范化运行时预算配置（拒绝 0、负数、小数、NaN、Infinity、超过硬上限）。
 */
export function normalizeFlowExecutionLimits(
  limits?: Partial<FlowExecutionLimits>,
): FlowExecutionLimits {
  if (!limits) {
    return DEFAULT_FLOW_EXECUTION_LIMITS;
  }

  const result: Record<string, number> = { ...DEFAULT_FLOW_EXECUTION_LIMITS };

  for (const key of Object.keys(DEFAULT_FLOW_EXECUTION_LIMITS) as (keyof FlowExecutionLimits)[]) {
    const val = limits[key];
    if (val !== undefined) {
      const hard = HARD_FLOW_EXECUTION_LIMITS[key];
      if (
        typeof val !== 'number' ||
        !Number.isFinite(val) ||
        !Number.isInteger(val) ||
        val <= 0 ||
        val > hard
      ) {
        throw new Error(
          `Invalid flowExecutionLimits.${key}: must be a positive finite integer <= ${hard}, got ${val}`,
        );
      }
      result[key] = val;
    }
  }

  return Object.freeze(result as unknown as FlowExecutionLimits);
}

/**
 * 稳定 Flow 错误码（Issue #46 F2）
 */
export type FlowErrorCode =
  | 'FLOW_NOT_FOUND'
  | 'FLOW_UNSUPPORTED_STEP'
  | 'FLOW_STEP_FAILED'
  | 'FLOW_ABORTED'
  | 'FLOW_DURATION_EXCEEDED'
  | 'FLOW_ACTION_BUDGET_EXCEEDED'
  | 'FLOW_ITERATION_BUDGET_EXCEEDED'
  | 'FLOW_DEPTH_EXCEEDED'
  | 'FLOW_CONCURRENCY_EXCEEDED';

/**
 * 调用栈帧（从根 Flow 到当前/失败 Flow）
 */
export interface FlowTraceFrame {
  readonly flow: string;
  readonly step: number | null;
}

/**
 * 结构化诊断对象（JSON-safe、不可变快照）
 */
export interface FlowDiagnostic {
  readonly code: FlowErrorCode;
  readonly flow: string;
  readonly step: number | null; // 顶层 step，0-based
  readonly stepPath: readonly (string | number)[];
  readonly path: readonly (string | number)[];
  readonly trace: readonly FlowTraceFrame[];
  readonly message: string;
}

/**
 * 单一 FlowExecutionError（包含结构化诊断快照与 cause）
 */
export class FlowExecutionError extends Error {
  readonly diagnostic: FlowDiagnostic;
  cause?: Error;

  constructor(diagnostic: FlowDiagnostic, cause?: unknown) {
    super(diagnostic.message);
    this.name = 'FlowExecutionError';
    this.diagnostic = Object.freeze({
      code: diagnostic.code,
      flow: diagnostic.flow,
      step: diagnostic.step,
      stepPath: Object.freeze([...diagnostic.stepPath]),
      path: Object.freeze([...diagnostic.path]),
      trace: Object.freeze(
        diagnostic.trace.map((frame) => Object.freeze({ flow: frame.flow, step: frame.step })),
      ),
      message: diagnostic.message,
    });
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }

  get code(): FlowErrorCode {
    return this.diagnostic.code;
  }

  get flow(): string {
    return this.diagnostic.flow;
  }

  get step(): number | null {
    return this.diagnostic.step;
  }

  get stepPath(): readonly (string | number)[] {
    return this.diagnostic.stepPath;
  }

  get path(): readonly (string | number)[] {
    return this.diagnostic.path;
  }

  get trace(): readonly FlowTraceFrame[] {
    return this.diagnostic.trace;
  }
}

/**
 * FlowRun 执行结果
 */
export interface FlowRunSuccessResult {
  readonly status: 'success';
  readonly flow: string;
  readonly recovered: false;
}

export interface FlowRunRecoveredResult {
  readonly status: 'recovered';
  readonly flow: string;
  readonly recovered: true;
  readonly error?: unknown;
}

export type FlowRunResult = FlowRunSuccessResult | FlowRunRecoveredResult;

/**
 * 判断错误码是否属于不可恢复错误（不可被 action 或 Flow 级 onError 捕获）
 */
export function isNonRecoverableFlowErrorCode(code: FlowErrorCode): boolean {
  return code !== 'FLOW_STEP_FAILED';
}

/**
 * 内部 FlowRun 标识 Symbol
 */
export const FLOW_RUN_CONTEXT = Symbol('FlowRunContext');

/**
 * 注入执行上下文的内部 FlowRun 上下文
 */
export interface FlowRunContext {
  readonly flowRun: FlowRun;
  readonly flowKey: string;
  readonly topStepIndex: number | null;
  readonly stepPath: readonly (string | number)[];
  readonly signal: AbortSignal;
  throwIfAborted(): void;
  createAbortError(): FlowExecutionError;
}

export function getFlowRunContext(context: Record<string, unknown>): FlowRunContext | undefined {
  return (context as Record<PropertyKey, unknown>)[FLOW_RUN_CONTEXT] as FlowRunContext | undefined;
}

export function withFlowRunPath(
  context: ExecutionContext,
  flowContext: FlowRunContext,
  stepPath: readonly (string | number)[],
  topStepIndex: number | null = flowContext.topStepIndex,
): ExecutionContext {
  const updatedFlowContext: FlowRunContext = {
    ...flowContext,
    stepPath,
    topStepIndex,
  };
  return {
    ...context,
    [FLOW_RUN_CONTEXT]: updatedFlowContext,
  };
}

/**
 * FlowRun: 单次根流程执行的内存会话实例（F2 运行内核）。
 * 持有 analysis 快照、调用栈、计数器和 signal；嵌套 Flow 共享同一 FlowRun 预算与 signal。
 */
export class FlowRun {
  readonly session: RuntimeSession;
  readonly flowAnalysis: ActionFlowAnalysis;
  readonly limits: FlowExecutionLimits;

  private executedActionsCount = 0;
  private loopIterationsCount = 0;
  private readonly callStack: { flow: string; step: number | null }[] = [];
  private readonly runController = new AbortController();
  private durationTimedOut = false;
  private durationTimer?: ReturnType<typeof setTimeout>;
  private deadline?: number;
  private sessionAbortListener?: () => void;
  private executor: DSLExecutor;

  constructor(
    session: RuntimeSession,
    flowAnalysis: ActionFlowAnalysis,
    limits: FlowExecutionLimits,
  ) {
    this.session = session;
    this.flowAnalysis = flowAnalysis;
    this.limits = limits;
    this.executor = session.dispatcher.getExecutor();
  }

  get signal(): AbortSignal {
    return this.runController.signal;
  }

  abort(): void {
    if (!this.runController.signal.aborted) {
      this.runController.abort();
    }
  }

  /**
   * 检查并抛出中止异常（除 signal/session 外主动比较当前时间与 deadline）
   */
  throwIfAborted(
    flowKey: string = this.currentFlowKey,
    stepIndex: number | null = this.currentTopStep,
    stepPath: readonly (string | number)[] = this.currentStepPath,
  ): void {
    if (this.durationTimedOut || (this.deadline !== undefined && Date.now() > this.deadline)) {
      this.durationTimedOut = true;
      if (!this.runController.signal.aborted) {
        this.runController.abort();
      }
      throw this.createError(
        'FLOW_DURATION_EXCEEDED',
        flowKey,
        stepIndex,
        stepPath,
        `Flow duration exceeded: maximum ${this.limits.maxDurationMs}ms allowed`,
      );
    }
    if (this.session.isDisposed()) {
      throw this.createError(
        'FLOW_ABORTED',
        flowKey,
        stepIndex,
        stepPath,
        'RuntimeSession is disposed',
      );
    }
    if (this.runController.signal.aborted) {
      throw this.createError(
        'FLOW_ABORTED',
        flowKey,
        stepIndex,
        stepPath,
        'Flow execution aborted',
      );
    }
  }

  /**
   * 创建中止或超时错误
   */
  createAbortError(
    flowKey: string = this.currentFlowKey,
    stepIndex: number | null = this.currentTopStep,
    stepPath: readonly (string | number)[] = this.currentStepPath,
  ): FlowExecutionError {
    const isDuration =
      this.durationTimedOut || (this.deadline !== undefined && Date.now() > this.deadline);
    const code: FlowErrorCode = isDuration ? 'FLOW_DURATION_EXCEEDED' : 'FLOW_ABORTED';
    const message = isDuration
      ? `Flow duration exceeded: maximum ${this.limits.maxDurationMs}ms allowed`
      : 'Flow execution aborted';
    return this.createError(code, flowKey, stepIndex, stepPath, message);
  }

  /**
   * 内部 abortable-await 辅助方法：
   * 将动作 Promise 与 FlowRun signal/deadline 进行 race。
   * - Action Promise 与 signal race。
   * - abort/dispose/timeout 时立即 reject，不等待 actionPromise settle。
   * - 成功返回后再次检查 deadline/signal。
   * - 无论哪条完成路径，都移除 abort 监听器。
   * - losing Promise 后续 reject 时不会产生 unhandled rejection。
   */
  async executeWithAbortRace<T>(
    actionPromise: Promise<T>,
    flowKey: string = this.currentFlowKey,
    stepIndex: number | null = this.currentTopStep,
    stepPath: readonly (string | number)[] = this.currentStepPath,
  ): Promise<T> {
    // 附加静默 catch，防止 actionPromise 在输掉 race 之后才发生 reject 导致 unhandled rejection
    actionPromise.catch(() => {});

    this.throwIfAborted(flowKey, stepIndex, stepPath);

    let cleanup: (() => void) | undefined;

    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        try {
          this.throwIfAborted(flowKey, stepIndex, stepPath);
          reject(this.createAbortError(flowKey, stepIndex, stepPath));
        } catch (err) {
          reject(err);
        }
      };

      if (
        this.runController.signal.aborted ||
        this.session.isDisposed() ||
        (this.deadline !== undefined && Date.now() > this.deadline)
      ) {
        onAbort();
        return;
      }

      this.runController.signal.addEventListener('abort', onAbort, { once: true });
      cleanup = () => {
        this.runController.signal.removeEventListener('abort', onAbort);
      };
    });

    try {
      const result = await Promise.race([actionPromise, abortPromise]);
      this.throwIfAborted(flowKey, stepIndex, stepPath);
      return result;
    } finally {
      cleanup?.();
    }
  }

  /**
   * 递增动作执行计数器并检查预算
   */
  incrementActionCount(flowContext: FlowRunContext, _action: Action): void {
    this.throwIfAborted(flowContext.flowKey, flowContext.topStepIndex, flowContext.stepPath);
    this.executedActionsCount += 1;
    if (this.executedActionsCount > this.limits.maxExecutedActions) {
      throw this.createError(
        'FLOW_ACTION_BUDGET_EXCEEDED',
        flowContext.flowKey,
        flowContext.topStepIndex,
        flowContext.stepPath,
        `Flow action execution budget exceeded: maximum ${this.limits.maxExecutedActions} actions allowed`,
      );
    }
  }

  /**
   * 递增循环迭代计数器并检查预算
   */
  incrementLoopIteration(flowContext: FlowRunContext): void {
    this.throwIfAborted(flowContext.flowKey, flowContext.topStepIndex, flowContext.stepPath);
    this.loopIterationsCount += 1;
    if (this.loopIterationsCount > this.limits.maxLoopIterations) {
      throw this.createError(
        'FLOW_ITERATION_BUDGET_EXCEEDED',
        flowContext.flowKey,
        flowContext.topStepIndex,
        flowContext.stepPath,
        `Flow loop iteration budget exceeded: maximum ${this.limits.maxLoopIterations} iterations allowed`,
      );
    }
  }

  /**
   * 构造标准化不可变 FlowExecutionError
   */
  createError(
    code: FlowErrorCode,
    flowKey: string,
    stepIndex: number | null,
    stepPath: readonly (string | number)[],
    message: string,
    cause?: unknown,
  ): FlowExecutionError {
    const trace: FlowTraceFrame[] = this.callStack.map((frame) => ({
      flow: frame.flow,
      step: frame.step,
    }));

    if (trace.length === 0 || trace[trace.length - 1].flow !== flowKey) {
      trace.push({ flow: flowKey, step: stepIndex });
    } else {
      trace[trace.length - 1] = { flow: flowKey, step: stepIndex };
    }

    const path = ['logic', 'flows', flowKey, ...stepPath];
    const diagnostic: FlowDiagnostic = {
      code,
      flow: flowKey,
      step: stepIndex,
      stepPath,
      path,
      trace,
      message,
    };
    return new FlowExecutionError(diagnostic, cause);
  }

  private get currentFlowKey(): string {
    return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1].flow : '';
  }

  private get currentTopStep(): number | null {
    return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1].step : null;
  }

  private get currentStepPath(): readonly (string | number)[] {
    const step = this.currentTopStep;
    return step !== null ? ['steps', step] : [];
  }

  /**
   * 根 Flow 执行入口
   */
  async execute(flowId: string, input?: unknown): Promise<FlowRunResult> {
    if (this.session.isDisposed()) {
      throw this.createError('FLOW_ABORTED', flowId, null, [], 'RuntimeSession is disposed');
    }

    if (!this.flowAnalysis || !this.flowAnalysis.flows || !this.flowAnalysis.flows[flowId]) {
      throw this.createError('FLOW_NOT_FOUND', flowId, null, [], `Flow not found: "${flowId}"`);
    }

    // 记录单调 deadline 与设置耗时定时器
    this.deadline =
      this.limits.maxDurationMs > 0 ? Date.now() + this.limits.maxDurationMs : undefined;

    if (this.limits.maxDurationMs > 0) {
      this.durationTimer = setTimeout(() => {
        this.durationTimedOut = true;
        this.runController.abort();
      }, this.limits.maxDurationMs);
    }

    this.sessionAbortListener = () => {
      this.runController.abort();
    };
    this.session.signal.addEventListener('abort', this.sessionAbortListener, { once: true });

    try {
      return await this.executeFlowInternal(flowId, input);
    } finally {
      if (this.durationTimer !== undefined) {
        clearTimeout(this.durationTimer);
        this.durationTimer = undefined;
      }
      if (this.sessionAbortListener) {
        this.session.signal.removeEventListener('abort', this.sessionAbortListener);
        this.sessionAbortListener = undefined;
      }
    }
  }

  /**
   * 嵌套 Flow 执行入口（由 runFlow handler 调用）
   */
  async executeChildFlow(
    targetFlowKey: string,
    resolvedInput: unknown,
    parentCallerContext: ExecutionContext,
  ): Promise<FlowRunResult> {
    return this.executeFlowInternal(targetFlowKey, resolvedInput, parentCallerContext);
  }

  private createFlowRunContext(
    flowKey: string,
    topStepIndex: number | null,
    stepPath: readonly (string | number)[],
  ): FlowRunContext {
    return {
      flowRun: this,
      flowKey,
      topStepIndex,
      stepPath,
      signal: this.runController.signal,
      throwIfAborted: () => this.throwIfAborted(flowKey, topStepIndex, stepPath),
      createAbortError: () => this.createAbortError(flowKey, topStepIndex, stepPath),
    };
  }

  private createExecutionContext(
    flowKey: string,
    topStepIndex: number | null,
    stepPath: readonly (string | number)[],
    input: unknown,
    parentCallerContext?: ExecutionContext,
    extraScope?: Record<string, unknown>,
  ): ExecutionContext {
    const base = this.session.dispatcher.getExecutionContext();
    const flowContext = this.createFlowRunContext(flowKey, topStepIndex, stepPath);

    // 隔离父 Flow 的 item、index、response、error 等局部变量；继承宿主能力与当前 Session State
    return {
      ...base,
      runtime: this.session.runtime,
      data: this.session.runtime.getData(),
      state: this.session.runtime.getState(),
      computed: this.session.runtime.getComputed(),
      formData: this.session.runtime.getFormData(),
      components: this.session.runtime.getComponents(),
      session: this.session,
      hostCapabilities: parentCallerContext?.hostCapabilities ?? base.hostCapabilities,
      ui: parentCallerContext?.ui ?? base.ui,
      api: parentCallerContext?.api ?? base.api,
      navigate: parentCallerContext?.navigate ?? base.navigate,
      input,
      ...extraScope,
      [FLOW_RUN_CONTEXT]: flowContext,
    };
  }

  private async executeFlowInternal(
    flowKey: string,
    input: unknown,
    parentCallerContext?: ExecutionContext,
  ): Promise<FlowRunResult> {
    this.throwIfAborted(flowKey, null, []);

    // 检查调用深度
    if (this.callStack.length + 1 > this.limits.maxFlowDepth) {
      throw this.createError(
        'FLOW_DEPTH_EXCEEDED',
        flowKey,
        null,
        [],
        `Flow call depth exceeded: maximum depth ${this.limits.maxFlowDepth} allowed`,
      );
    }

    const flow = this.flowAnalysis.flows[flowKey];
    if (!flow) {
      throw this.createError('FLOW_NOT_FOUND', flowKey, null, [], `Flow not found: "${flowKey}"`);
    }

    const stackFrame = { flow: flowKey, step: null as number | null };
    this.callStack.push(stackFrame);

    try {
      for (let i = 0; i < flow.steps.length; i++) {
        this.throwIfAborted(flowKey, i, ['steps', i]);
        stackFrame.step = i;

        const stepAction = flow.steps[i];
        const stepContext = this.createExecutionContext(
          flowKey,
          i,
          ['steps', i],
          input,
          parentCallerContext,
        );

        try {
          await this.executor.executeSingle(stepAction, stepContext);
        } catch (err) {
          // 不可恢复错误（预算、Abort、超时、协议不支持）直接向外抛出，不进入 onError
          if (err instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(err.code)) {
            throw err;
          }
          if (this.runController.signal.aborted || this.session.isDisposed()) {
            throw this.createAbortError(flowKey, i, ['steps', i]);
          }

          const stepFailedError =
            err instanceof FlowExecutionError
              ? err
              : this.createError(
                  'FLOW_STEP_FAILED',
                  flowKey,
                  i,
                  ['steps', i],
                  err instanceof Error ? err.message : String(err),
                  err,
                );

          // Flow 级 onError：最多执行一次
          if (flow.onError && flow.onError.length > 0) {
            return await this.executeFlowOnError(
              flowKey,
              flow.onError,
              stepFailedError,
              input,
              parentCallerContext,
            );
          }

          throw stepFailedError;
        }
      }

      return { status: 'success', flow: flowKey, recovered: false };
    } finally {
      this.callStack.pop();
    }
  }

  private async executeFlowOnError(
    flowKey: string,
    onErrorActions: ActionList,
    originalError: FlowExecutionError,
    input: unknown,
    parentCallerContext?: ExecutionContext,
  ): Promise<FlowRunResult> {
    const stackFrame = this.callStack[this.callStack.length - 1];
    if (stackFrame) {
      stackFrame.step = null;
    }

    for (let j = 0; j < onErrorActions.length; j++) {
      this.throwIfAborted(flowKey, null, ['onError', j]);

      const action = onErrorActions[j];
      const onErrorContext = this.createExecutionContext(
        flowKey,
        null,
        ['onError', j],
        input,
        parentCallerContext,
        {
          error: originalError.message,
          errorObject: originalError,
        },
      );

      try {
        await this.executor.executeSingle(action, onErrorContext);
      } catch (newErr) {
        if (newErr instanceof FlowExecutionError && isNonRecoverableFlowErrorCode(newErr.code)) {
          throw newErr;
        }
        if (this.runController.signal.aborted || this.session.isDisposed()) {
          throw this.createAbortError(flowKey, null, ['onError', j]);
        }

        // onError 自身失败：向外传播新错误，并通过 cause 保留原错误
        const onErrorFailedError =
          newErr instanceof FlowExecutionError
            ? new FlowExecutionError(newErr.diagnostic, originalError)
            : this.createError(
                'FLOW_STEP_FAILED',
                flowKey,
                null,
                ['onError', j],
                newErr instanceof Error ? newErr.message : String(newErr),
                originalError,
              );
        throw onErrorFailedError;
      }
    }

    return {
      status: 'recovered',
      flow: flowKey,
      recovered: true,
      error: originalError,
    };
  }
}
