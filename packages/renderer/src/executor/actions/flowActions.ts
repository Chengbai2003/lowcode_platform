/**
 * 流程控制 Actions
 * if, loop, runFlow
 */

import type { ActionHandler, ExecutionContext } from '../../dsl';
import type { IfAction, LoopAction, RunFlowAction } from '../../dsl/actions/flow';
import { resolveValue } from '../parser';
import { getFlowRunContext, withFlowRunPath } from '../../session/FlowRun';
import type { RuntimeSession } from '../../session/RuntimeSession';

/**
 * 条件分支
 * Action: { type: 'if'; condition: Value; then: Action[]; else?: Action[]; }
 */
export const ifAction: ActionHandler = async (action, context, executor) => {
  const flowContext = getFlowRunContext(context);
  if (flowContext) {
    flowContext.throwIfAborted();
  }

  const ifActionTyped = action as IfAction;
  const { condition, then: thenActions, else: elseActions } = ifActionTyped;
  const resolvedCondition = resolveValue(condition, context);
  const isTrue = Boolean(resolvedCondition);

  if (isTrue && thenActions && executor) {
    if (flowContext) {
      for (let i = 0; i < thenActions.length; i++) {
        flowContext.throwIfAborted();
        const act = thenActions[i];
        const childContext = withFlowRunPath(context, flowContext, [
          ...flowContext.stepPath,
          'then',
          i,
        ]);
        await (executor as any).executeSingle(act, childContext);
      }
    } else {
      for (const act of thenActions) {
        await (executor as any).executeSingle(act, context);
      }
    }
  } else if (!isTrue && elseActions && executor) {
    if (flowContext) {
      for (let i = 0; i < elseActions.length; i++) {
        flowContext.throwIfAborted();
        const act = elseActions[i];
        const childContext = withFlowRunPath(context, flowContext, [
          ...flowContext.stepPath,
          'else',
          i,
        ]);
        await (executor as any).executeSingle(act, childContext);
      }
    } else {
      for (const act of elseActions) {
        await (executor as any).executeSingle(act, context);
      }
    }
  }

  return { condition: resolvedCondition, branch: isTrue ? 'then' : 'else' };
};

/**
 * 循环
 * Action: { type: 'loop'; over: Value; itemVar: string; indexVar?: string; actions: Action[]; }
 */
export const loopAction: ActionHandler = async (action, context, executor) => {
  const flowContext = getFlowRunContext(context);
  if (flowContext) {
    flowContext.throwIfAborted();
  }

  const loopActionTyped = action as LoopAction;
  const { over, itemVar, indexVar, actions } = loopActionTyped;
  const resolvedOver = resolveValue(over, context);

  if (!Array.isArray(resolvedOver)) {
    throw new Error(`loop: 'over' must be an array, got ${typeof resolvedOver}`);
  }

  if (!actions || actions.length === 0) {
    return { count: resolvedOver.length, items: resolvedOver };
  }

  const results = [];

  for (let i = 0; i < resolvedOver.length; i++) {
    if (flowContext) {
      flowContext.flowRun.incrementLoopIteration(flowContext);
    }
    const item = resolvedOver[i];

    // 创建循环上下文（不可变模式：创建新对象而非修改）
    const loopContext: ExecutionContext = {
      ...context,
      [itemVar]: item,
      ...(indexVar ? { [indexVar]: i } : {}),
    } as ExecutionContext;

    if (flowContext) {
      for (let a = 0; a < actions.length; a++) {
        flowContext.throwIfAborted();
        const act = actions[a];
        const childContext = withFlowRunPath(loopContext, flowContext, [
          ...flowContext.stepPath,
          'actions',
          a,
        ]);
        const result = await (executor as any).executeSingle(act, childContext);
        results.push(result);
      }
    } else {
      // 执行循环体（Legacy 模式）
      const result = await (executor as any).execute(actions, loopContext);
      results.push(result);
    }
  }

  return { count: resolvedOver.length, items: resolvedOver, results };
};

/**
 * 运行具名 ActionFlow
 * Action: { type: 'runFlow'; flow: string; input?: Value; }
 */
export const runFlowAction: ActionHandler = async (action, context) => {
  const runFlowTyped = action as RunFlowAction;
  const targetFlow = runFlowTyped.flow;
  const rawInput = runFlowTyped.input;
  const resolvedInput = rawInput !== undefined ? resolveValue(rawInput, context) : undefined;
  const isolatedInput =
    resolvedInput !== undefined && typeof resolvedInput === 'object' && resolvedInput !== null
      ? (() => {
          try {
            return structuredClone(resolvedInput);
          } catch {
            return resolvedInput;
          }
        })()
      : resolvedInput;

  const flowContext = getFlowRunContext(context);
  if (flowContext) {
    flowContext.throwIfAborted();
    return await flowContext.flowRun.executeChildFlow(targetFlow, isolatedInput, context);
  }

  const session = (context as { session?: RuntimeSession }).session;
  if (session) {
    return await session.executeFlow(targetFlow, isolatedInput);
  }

  throw new Error('runFlow action can only be executed within an active FlowRun or RuntimeSession');
};

/**
 * 导出所有流程控制 Actions
 */
export default {
  if: ifAction,
  loop: loopAction,
  runFlow: runFlowAction,
};
