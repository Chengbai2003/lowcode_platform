/**
 * 流程控制 Actions
 * if, loop
 */

import type { ActionHandler, ExecutionContext } from '../../../types';
import type { IfAction, LoopAction } from '../../../types/dsl/actions/flow';
import { resolveValue } from '../parser';

/**
 * 条件分支
 * Action: { type: 'if'; condition: Value; then: Action[]; else?: Action[]; }
 */
export const ifAction: ActionHandler = async (action, context, executor) => {
  const ifActionTyped = action as IfAction;
  const { condition, then: thenActions, else: elseActions } = ifActionTyped;
  const resolvedCondition = resolveValue(condition, context);
  const isTrue = Boolean(resolvedCondition);

  if (isTrue && thenActions && executor) {
    for (const act of thenActions) {
      await (executor as any).executeSingle(act, context);
    }
  } else if (!isTrue && elseActions && executor) {
    for (const act of elseActions) {
      await (executor as any).executeSingle(act, context);
    }
  }

  return { condition: resolvedCondition, branch: isTrue ? 'then' : 'else' };
};

/**
 * 循环
 * Action: { type: 'loop'; over: Value; itemVar: string; indexVar?: string; actions: Action[]; }
 */
export const loopAction: ActionHandler = async (action, context, executor) => {
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
    const item = resolvedOver[i];

    // 创建循环上下文（不可变模式：创建新对象而非修改）
    const loopContext: ExecutionContext = {
      ...context,
      [itemVar]: item,
      ...(indexVar ? { [indexVar]: i } : {}),
    } as ExecutionContext;

    // 执行循环体
    const result = await (executor as any).execute(actions, loopContext);
    results.push(result);
  }

  return { count: resolvedOver.length, items: resolvedOver, results };
};

/**
 * 导出所有流程控制 Actions
 */
export default {
  if: ifAction,
  loop: loopAction,
};
