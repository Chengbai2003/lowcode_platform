/**
 * 只读数据源 Actions（M1b-1 PR C / ADR-0005）
 *
 * executeDataSource：宿主服务调用是唯一网络出口（绝不 fallback 到
 * fetch / context.api / apiCall）。执行语义（PR C 冻结）：
 * - 授权 gate：`hostCapabilities.dataResources === true` 且
 *   `context.dataSources.execute` 为函数，缺一 fail-close（零宿主调用）；
 * - 参数：声明 params 在动作开始时经现有 resolveValues 求值一次并深冻结；
 * - 代际：Session 内按 sourceId latest-started-wins，启动即取消旧请求；
 *   只有仍是当前代际且 Session 存活（Flow 内还需未 abort）的结果才提交；
 * - 取消（代际被取代 / dispose / Flow abort）不可恢复、不经 onError；
 * - 失败（B 错误码 Outcome）可恢复：Flow 内成为 FLOW_STEP_FAILED 进入
 *   Flow 级 onError，普通事件返回结构化失败结果；失败/取消保留旧值；
 * - 无自动重试；v1 无动作级 onSuccess/onError 嵌套。
 */

import type {
  DataSourceDeclarations,
  DataSourceExecutionOutcome,
  DataSourceHostExecuteInput,
  ExecuteDataSourceAction,
} from '@lowcode-platform/schema-contract';
import type { ActionHandler } from '../../dsl';
import type { RuntimeSession } from '../../session/RuntimeSession';
import { FlowExecutionError, getFlowRunContext, type FlowRunContext } from '../../session/FlowRun';
import { isCapabilityGranted, type HostCapabilities } from '../../host/HostCapabilities';
import { resolveValues } from '../parser';

/** 可恢复的数据源失败：携带 B 错误码与 traceId，Flow 内进入 FLOW_STEP_FAILED 通道 */
export class DataSourceActionError extends Error {
  constructor(
    readonly dataSourceCode: string,
    readonly traceId: string | undefined,
    message: string,
  ) {
    super(
      `executeDataSource failed [${dataSourceCode}]${traceId ? ` (trace ${traceId})` : ''}: ${message}`,
    );
    this.name = 'DataSourceActionError';
  }
}

function getSession(context: Record<string, unknown>): RuntimeSession | undefined {
  return (context as { session?: RuntimeSession }).session;
}

function getDeclarations(context: Record<string, unknown>): DataSourceDeclarations | undefined {
  return (context as { dataSourceDeclarations?: DataSourceDeclarations }).dataSourceDeclarations;
}

/** 取消性失败（代际被取代/dispose/flow abort）：不可恢复，不经 onError */
function createSupersededFlowError(flowContext: FlowRunContext): FlowExecutionError {
  return flowContext.createAbortError();
}

/** 组合多个 signal（优先 AbortSignal.any；jsdom 等旧实现走手动组合） */
function combineSignals(signals: readonly AbortSignal[]): AbortSignal | undefined {
  if (signals.length === 0) {
    return undefined;
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([...signals]);
  }
  const composite = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      composite.abort(signal.reason);
      return composite.signal;
    }
    signal.addEventListener('abort', () => composite.abort(signal.reason), { once: true });
  }
  return composite.signal;
}

export const executeDataSource: ActionHandler = async (action, context) => {
  const dsAction = action as ExecuteDataSourceAction;
  const { sourceId, resultTo } = dsAction;
  const flowContext = getFlowRunContext(context);
  const session = getSession(context);
  const hostService = (context as { dataSources?: { execute?: unknown } }).dataSources;

  // 1. 授权 gate（配置级 fail-close，同 apiCall gate 位置：在 try 外抛出）
  const hostCaps = context.hostCapabilities as Readonly<HostCapabilities> | undefined;
  if (
    !isCapabilityGranted(hostCaps, 'dataResources') ||
    typeof hostService?.execute !== 'function'
  ) {
    throw new Error(
      'Host capability denied: "dataResources" — grant the capability and inject context.dataSources (host service) to execute data sources',
    );
  }
  const execute = hostService.execute as (
    input: DataSourceHostExecuteInput,
    signal?: AbortSignal,
  ) => Promise<DataSourceExecutionOutcome>;

  // 2. 代际守卫依赖 Session：无 Session（旧宿主上下文）时 fail-close
  if (!session) {
    throw new Error('executeDataSource requires a RuntimeSession (generation guard)');
  }

  // 3. 声明解析（来自渲染入口经校验的 canonical Schema，纵深防御）
  const declaration = getDeclarations(context)?.[sourceId];
  if (!declaration) {
    throw new DataSourceActionError(
      'DATASOURCE_REFERENCE_MISSING',
      undefined,
      `sourceId "${sourceId}" is not declared on this page`,
    );
  }

  // 4. 参数求值并冻结快照（后续 state 变化不影响已发出的请求）
  const frozenParams = declaration.params
    ? (structuredClone(resolveValues(declaration.params, context)) as Record<string, unknown>)
    : undefined;

  // 5. 代际登记：同 sourceId 旧请求立即取消
  const run = session.startDataSourceRun(sourceId);
  const signals: AbortSignal[] = [session.signal, run.signal];
  if (flowContext) {
    flowContext.throwIfAborted();
    signals.push(flowContext.signal);
  }
  const signal = combineSignals(signals);

  try {
    const outcome = await execute(
      { sourceId, params: frozenParams as DataSourceHostExecuteInput['params'] },
      signal,
    );

    // 每次 await 返回后先判取消：取消结束执行，不触发可恢复错误路径
    if (run.signal.aborted || session.isDisposed() || flowContext?.signal.aborted) {
      if (flowContext) {
        throw createSupersededFlowError(flowContext);
      }
      return { success: false, aborted: true };
    }

    if (outcome.ok) {
      // 提交守卫：校验成功且仍是当前代际才整值写入已声明的顶层 state 槽位
      if (!session.isCurrentDataSourceRun(sourceId, run)) {
        return { success: false, superseded: true };
      }
      context.runtime.set(resultTo, outcome.result);
      return { success: true, result: outcome.result, resultTo };
    }

    // 可恢复失败：Flow 内抛出（FlowRun 包装为 FLOW_STEP_FAILED → Flow 级
    // onError），普通事件返回结构化结果并保留旧值
    const failure = new DataSourceActionError(outcome.code, outcome.traceId, outcome.message);
    if (flowContext) {
      throw failure;
    }
    return {
      success: false,
      code: outcome.code,
      message: outcome.message,
      traceId: outcome.traceId,
    };
  } catch (error) {
    // 宿主服务异常：取消性异常（abort/dispose/被取代）走取消语义；
    // 其余按可恢复失败处理（适配器缺陷不应中止页面，但必须可见）
    const cancelled =
      run.signal.aborted ||
      session.isDisposed() ||
      flowContext?.signal.aborted ||
      (error instanceof Error && error.name === 'AbortError');
    if (cancelled) {
      if (flowContext) {
        flowContext.throwIfAborted();
        throw createSupersededFlowError(flowContext);
      }
      return { success: false, aborted: true };
    }
    if (error instanceof DataSourceActionError) {
      if (flowContext) {
        throw error;
      }
      return {
        success: false,
        code: error.dataSourceCode,
        message: error.message,
        traceId: error.traceId,
      };
    }
    throw error;
  } finally {
    session.finishDataSourceRun(sourceId, run);
  }
};

export default {
  executeDataSource,
};
