/**
 * 流程控制 Actions
 * if, switch, loop, parallel, sequence, tryCatch
 */

import type { ActionHandler, ExecutionContext, Action, ActionList } from '../../types/dsl';
import { resolveValue } from '../parser';

/**
 * 条件判断
 * Action: { type: 'if'; condition: Value; then: Action[]; else?: Action[]; }
 */
export const ifAction: ActionHandler = async (action, context, executor) => {
  const { condition, then: thenActions, else: elseActions } = action;
  const resolvedCondition = resolveValue(condition, context);

  // 将结果转为布尔值
  const isTrue = Boolean(resolvedCondition);

  if (isTrue) {
    if (thenActions && executor) {
      for (const thenAction of thenActions) {
        await executor.executeSingle(thenAction, context);
      }
    }
  } else if (elseActions && executor) {
    for (const elseAction of elseActions) {
      await executor.executeSingle(elseAction, context);
    }
  }

  return { condition: resolvedCondition, branch: isTrue ? 'then' : 'else' };
};

/**
 * 多分支选择
 * Action: { type: 'switch'; value: Value; cases: Array<{ match: Value; actions: Action[] }>; default?: Action[]; }
 */
export const switchAction: ActionHandler = async (action, context, executor) => {
  const { value, cases, default: defaultActions } = action;
  const resolvedValue = resolveValue(value, context);

  let matched = false;

  for (const cas of cases) {
    const resolvedMatch = resolveValue(cas.match, context);

    if (resolvedMatch === resolvedValue) {
      matched = true;
      if (cas.actions && executor) {
        for (const actionItem of cas.actions) {
          await executor.executeSingle(actionItem, context);
        }
      }
      break;
    }
  }

  if (!matched && defaultActions && executor) {
    for (const actionItem of defaultActions) {
      await executor.executeSingle(actionItem, context);
    }
  }

  return { value: resolvedValue, matched };
};

/**
 * 循环执行
 * Action: { type: 'loop'; over: Value; itemVar: string; indexVar?: string; actions: Action[]; }
 */
export const loopAction: ActionHandler = async (action, context, executor) => {
  const { over, itemVar, indexVar, actions } = action;
  const resolvedOver = resolveValue(over, context);

  if (!Array.isArray(resolvedOver)) {
    throw new Error(`loop: 'over' must be an array, got ${typeof resolvedOver}`);
  }

  if (!actions || actions.length === 0) {
    return { count: 0, items: resolvedOver };
  }

  const results = [];

  for (let i = 0; i < resolvedOver.length; i++) {
    const item = resolvedOver[i];

    // 创建循环上下文
    const loopContext: Partial<ExecutionContext> = {
      ...context,
    };

    // 设置循环变量
    if (itemVar) {
      loopContext[itemVar] = item;
    }

    // 设置索引变量
    if (indexVar) {
      loopContext[indexVar] = i;
    }

    // 执行循环体
    const result = await executor.execute(actions, loopContext as ExecutionContext);
    results.push(result);
  }

  return { count: resolvedOver.length, items: resolvedOver, results };
};

/**
 * 并行执行
 * Action: { type: 'parallel'; actions: Action[]; waitAll?: boolean; }
 */
export const parallelAction: ActionHandler = async (action, context, executor) => {
  const { actions, waitAll = true } = action;

  if (!actions || actions.length === 0) {
    return { count: 0, results: [] };
  }

  // 创建独立上下文副本
  const contexts = actions.map(() => ({ ...context }));

  // 并行执行所有Actions
  const promises = actions.map((actionItem, index) =>
    executor.executeSingle(actionItem, contexts[index])
  );

  if (waitAll) {
    // 等待所有完成
    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    return {
      count: actions.length,
      completed: fulfilled.length,
      failed: rejected.length,
      results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason),
    };
  } else {
    // 不等待，直接返回
    return { count: actions.length, waitAll: false };
  }
};

/**
 * 顺序执行（显式声明，默认行为）
 * Action: { type: 'sequence'; actions: Action[]; }
 */
export const sequenceAction: ActionHandler = async (action, context, executor) => {
  const { actions } = action;

  if (!actions || actions.length === 0) {
    return { count: 0 };
  }

  const results = [];

  for (const actionItem of actions) {
    const result = await executor.executeSingle(actionItem, context);
    results.push(result);
  }

  return { count: actions.length, results };
};

/**
 * 异常处理
 * Action: { type: 'tryCatch'; try: Action[]; catch: Action[]; finally?: Action[]; }
 */
export const tryCatchAction: ActionHandler = async (action, context, executor) => {
  const { try: tryActions, catch: catchActions, finally: finallyActions } = action;
  let error: Error | undefined;
  let tryResult: any;
  let catchResult: any;

  try {
    if (tryActions && executor) {
      for (const actionItem of tryActions) {
        tryResult = await executor.executeSingle(actionItem, context);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));

    if (catchActions && executor) {
      // 将错误信息添加到上下文
      const errorContext = {
        ...context,
        error: error.message,
        errorObject: error,
      };

      for (const actionItem of catchActions) {
        catchResult = await executor.executeSingle(actionItem, errorContext);
      }
    } else {
      // 没有catch块，重新抛出
      throw error;
    }
  } finally {
    if (finallyActions && executor) {
      for (const actionItem of finallyActions) {
        await executor.executeSingle(actionItem, context);
      }
    }
  }

  return {
    success: !error,
    error: error?.message,
    tryResult,
    catchResult,
  };
};

/**
 * 导出所有流程控制Actions
 */
export default {
  if: ifAction,
  switch: switchAction,
  loop: loopAction,
  parallel: parallelAction,
  sequence: sequenceAction,
  tryCatch: tryCatchAction,
};
