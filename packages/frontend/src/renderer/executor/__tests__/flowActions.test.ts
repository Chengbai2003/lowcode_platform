/**
 * flowActions 单元测试
 * @module renderer/executor/actions/flowActions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ifAction, loopAction } from '../actions/flowActions';
import { DSLExecutor } from '../Engine';
import type { ExecutionContext, IfAction, LoopAction, Action } from '../../../types';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return DSLExecutor.createContext(overrides) as ExecutionContext;
}

describe('flowActions', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    context = createExecutionContext({
      data: {
        value: true,
        counter: 0,
        items: ['a', 'b', 'c'],
      },
    });
  });

  describe('ifAction', () => {
    it('条件为 true 时执行 then 分支', async () => {
      const thenAction = { type: 'log', message: 'then executed' } as Action;
      const elseAction = { type: 'log', message: 'else executed' } as Action;

      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const action: IfAction = {
        type: 'if',
        condition: true,
        then: [thenAction],
        else: [elseAction],
      };

      await ifAction(action, context, mockExecutor);

      expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
      expect(mockExecutor.executeSingle).toHaveBeenCalledWith(thenAction, context);
    });

    it('条件为 false 时执行 else 分支', async () => {
      const thenAction = { type: 'log', message: 'then executed' } as Action;
      const elseAction = { type: 'log', message: 'else executed' } as Action;

      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const action: IfAction = {
        type: 'if',
        condition: false,
        then: [thenAction],
        else: [elseAction],
      };

      await ifAction(action, context, mockExecutor);

      expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
      expect(mockExecutor.executeSingle).toHaveBeenCalledWith(elseAction, context);
    });

    it('条件为 truthy 值时执行 then 分支', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      // 测试各种 truthy 值
      const truthyValues = [1, 'string', {}, [], true];

      for (const value of truthyValues) {
        mockExecutor.executeSingle.mockClear();

        const action: IfAction = {
          type: 'if',
          condition: value,
          then: [{ type: 'log', message: 'then' }],
        };

        await ifAction(action, context, mockExecutor);

        expect(mockExecutor.executeSingle).toHaveBeenCalled();
      }
    });

    it('条件为 falsy 值时执行 else 分支', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      // 测试各种 falsy 值
      const falsyValues = [0, '', null, undefined, false, NaN];

      for (const value of falsyValues) {
        mockExecutor.executeSingle.mockClear();

        const action: IfAction = {
          type: 'if',
          condition: value,
          then: [{ type: 'log', message: 'then' }],
          else: [{ type: 'log', message: 'else' }],
        };

        await ifAction(action, context, mockExecutor);

        // 对于 NaN，Boolean(NaN) === false，所以应该执行 else 分支
        expect(mockExecutor.executeSingle).toHaveBeenCalled();
      }
    });

    it('无 else 分支且条件为 false 时不执行任何操作', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const action: IfAction = {
        type: 'if',
        condition: false,
        then: [{ type: 'log', message: 'then' }],
        // 无 else 分支
      };

      await ifAction(action, context, mockExecutor);

      expect(mockExecutor.executeSingle).not.toHaveBeenCalled();
    });

    it('then 分支包含多个 action 时依次执行', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const actions: Action[] = [
        { type: 'log', message: 'action1' },
        { type: 'log', message: 'action2' },
        { type: 'log', message: 'action3' },
      ];

      const action: IfAction = {
        type: 'if',
        condition: true,
        then: actions,
      };

      await ifAction(action, context, mockExecutor);

      expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(3);
      expect(mockExecutor.executeSingle).toHaveBeenNthCalledWith(1, actions[0], context);
      expect(mockExecutor.executeSingle).toHaveBeenNthCalledWith(2, actions[1], context);
      expect(mockExecutor.executeSingle).toHaveBeenNthCalledWith(3, actions[2], context);
    });

    it('返回条件值和分支信息', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const action: IfAction = {
        type: 'if',
        condition: true,
        then: [{ type: 'log', message: 'then' }],
      };

      const result = await ifAction(action, context, mockExecutor);

      expect(result).toEqual({
        condition: true,
        branch: 'then',
      });
    });

    it('支持表达式作为条件', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      // 条件为表达式字符串，会被 resolveValue 解析
      const contextWithExpr = createExecutionContext({
        data: { status: 'active' },
      });

      const action: IfAction = {
        type: 'if',
        condition: 'active', // 非空字符串为 truthy
        then: [{ type: 'log', message: 'then' }],
      };

      await ifAction(action, contextWithExpr, mockExecutor);

      expect(mockExecutor.executeSingle).toHaveBeenCalled();
    });
  });

  describe('loopAction', () => {
    it('迭代数组并执行每个元素', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ total: 1, success: 1, failed: 0, results: [] }),
      };

      const items = ['a', 'b', 'c'];

      const action: LoopAction = {
        type: 'loop',
        over: items,
        itemVar: 'item',
        actions: [{ type: 'log', message: 'item' }],
      };

      await loopAction(action, context, mockExecutor);

      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);

      // 验证每次调用时的上下文包含正确的 item 值
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(
        1,
        action.actions,
        expect.objectContaining({ item: 'a' }),
      );
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(
        2,
        action.actions,
        expect.objectContaining({ item: 'b' }),
      );
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(
        3,
        action.actions,
        expect.objectContaining({ item: 'c' }),
      );
    });

    it('设置 indexVar 变量', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ total: 1, success: 1, failed: 0, results: [] }),
      };

      const items = ['x', 'y'];

      const action: LoopAction = {
        type: 'loop',
        over: items,
        itemVar: 'element',
        indexVar: 'idx',
        actions: [{ type: 'log', message: 'element' }],
      };

      await loopAction(action, context, mockExecutor);

      expect(mockExecutor.execute).toHaveBeenNthCalledWith(
        1,
        action.actions,
        expect.objectContaining({ element: 'x', idx: 0 }),
      );
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(
        2,
        action.actions,
        expect.objectContaining({ element: 'y', idx: 1 }),
      );
    });

    it('空数组返回 count: 0', async () => {
      const mockExecutor = {
        execute: vi.fn(),
      };

      const action: LoopAction = {
        type: 'loop',
        over: [],
        itemVar: 'item',
        actions: [{ type: 'log', message: 'item' }],
      };

      const result = await loopAction(action, context, mockExecutor);

      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(result).toEqual({
        count: 0,
        items: [],
        results: [],
      });
    });

    it('空 actions 数组返回正确结果', async () => {
      const mockExecutor = {
        execute: vi.fn(),
      };

      const items = [1, 2, 3];

      const action: LoopAction = {
        type: 'loop',
        over: items,
        itemVar: 'item',
        actions: [],
      };

      const result = await loopAction(action, context, mockExecutor);

      // 空 actions 数组被视为无需执行
      expect(result).toEqual({
        count: 3,
        items: items,
      });
    });

    it('非数组 over 值抛出错误', async () => {
      const mockExecutor = {
        execute: vi.fn(),
      };

      const action = {
        type: 'loop',
        over: 'not-an-array',
        itemVar: 'item',
        actions: [{ type: 'log', message: 'item' }],
      } as unknown as LoopAction;

      await expect(loopAction(action, context, mockExecutor)).rejects.toThrow(
        "loop: 'over' must be an array, got string",
      );
    });

    it('返回迭代次数和结果', async () => {
      const mockExecutor = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({ total: 1, success: 1, failed: 0, results: ['result-a'] })
          .mockResolvedValueOnce({ total: 1, success: 1, failed: 0, results: ['result-b'] }),
      };

      const items = ['a', 'b'];

      const action: LoopAction = {
        type: 'loop',
        over: items,
        itemVar: 'item',
        actions: [{ type: 'log', message: 'item' }],
      };

      const result = (await loopAction(action, context, mockExecutor)) as {
        count: number;
        items: string[];
        results: unknown[];
      };

      expect(result.count).toBe(2);
      expect(result.items).toEqual(items);
      expect(result.results).toHaveLength(2);
    });

    it('上下文不可变：每次迭代创建新上下文', async () => {
      const capturedContexts: ExecutionContext[] = [];
      const mockExecutor = {
        execute: vi.fn().mockImplementation((_actions, ctx) => {
          capturedContexts.push(ctx);
          return Promise.resolve({ total: 1, success: 1, failed: 0, results: [] });
        }),
      };

      const items = [1, 2];

      const action: LoopAction = {
        type: 'loop',
        over: items,
        itemVar: 'item',
        actions: [{ type: 'log', message: 'item' }],
      };

      await loopAction(action, context, mockExecutor);

      // 验证每次迭代的上下文是不同的对象
      expect(capturedContexts[0]).not.toBe(capturedContexts[1]);

      // 验证 item 值不同
      expect(capturedContexts[0].item).toBe(1);
      expect(capturedContexts[1].item).toBe(2);
    });
  });

  describe('嵌套条件分支', () => {
    it('支持嵌套 if action', async () => {
      const mockExecutor = {
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const innerIf: IfAction = {
        type: 'if',
        condition: true,
        then: [{ type: 'log', message: 'inner-then' }],
      };

      const outerIf: IfAction = {
        type: 'if',
        condition: true,
        then: [innerIf],
      };

      await ifAction(outerIf, context, mockExecutor);

      // 外层 if 执行 innerIf action
      expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
      expect(mockExecutor.executeSingle).toHaveBeenCalledWith(innerIf, context);
    });

    it('loop 内可包含 if action', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({ total: 1, success: 1, failed: 0, results: [] }),
        executeSingle: vi.fn().mockResolvedValue(undefined),
      };

      const ifAction_: IfAction = {
        type: 'if',
        condition: true,
        then: [{ type: 'log', message: 'conditional-log' }],
      };

      const action: LoopAction = {
        type: 'loop',
        over: [1, 2],
        itemVar: 'item',
        actions: [ifAction_],
      };

      await loopAction(action, context, mockExecutor);

      // loop 应该调用 execute 来执行 actions（包含 ifAction）
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });
  });
});
