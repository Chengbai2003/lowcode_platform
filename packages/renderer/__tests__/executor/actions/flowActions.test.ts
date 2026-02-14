/**
 * 流程控制Actions单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ifAction, switchAction, loopAction, parallelAction, tryCatchAction } from '../../../src/executor/actions/flowActions';
import { DSLExecutor } from '../../../src/executor/Engine';

function createMockExecutor() {
  const executor = vi.mocked(new DSLExecutor());
  // execute 返回模拟的批处理结果
  executor.execute = vi.fn().mockResolvedValue({
    total: 1,
    success: 1,
    failed: 0,
    results: [{ success: true, value: {}, duration: 0 }],
    duration: 0,
  });
  // executeSingle 返回空对象
  executor.executeSingle = vi.fn().mockResolvedValue({});
  return executor;
}

describe('ifAction', () => {
  let mockContext: any;
  let mockExecutor: any;

  beforeEach(() => {
    mockContext = {
      age: 30,
      name: 'John',
      status: 'active',
      count: 5,
    };
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该执行then分支当条件为真', async () => {
    const action = {
      type: 'if',
      condition: '{{age > 18}}',
      then: [
        { type: 'log', value: 'Adult' },
      ],
      else: [
        { type: 'log', value: 'Minor' },
      ],
    };

    const result = await ifAction(action, mockContext, mockExecutor);

    expect(result.branch).toBe('then');
    expect(result.condition).toBe(true);
    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
  });

  it('应该执行else分支当条件为假', async () => {
    const action = {
      type: 'if',
      condition: '{{age < 18}}',
      then: [
        { type: 'log', value: 'Minor' },
      ],
      else: [
        { type: 'log', value: 'Adult' },
      ],
    };

    const result = await ifAction(action, mockContext, mockExecutor);

    expect(result.branch).toBe('else');
    expect(result.condition).toBe(false);
  });

  it('应该没有else分支时跳过', async () => {
    const action = {
      type: 'if',
      condition: '{{age < 18}}',
      then: [
        { type: 'log', value: 'Minor' },
      ],
    };

    const result = await ifAction(action, mockContext, mockExecutor);

    expect(result.branch).toBe('else');
    expect(mockExecutor.executeSingle).not.toHaveBeenCalled();
  });

  it('应该解析条件表达式', async () => {
    const action = {
      type: 'if',
      condition: '{{name === "John" && status === "active"}}',
      then: [
        { type: 'log', value: 'Match' },
      ],
    };

    const result = await ifAction(action, mockContext, mockExecutor);

    expect(result.condition).toBe(true);
    expect(result.branch).toBe('then');
  });
});

describe('switchAction', () => {
  let mockContext: any;
  let mockExecutor: any;

  beforeEach(() => {
    mockContext = {
      status: 'pending',
      priority: 2,
    };
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该执行匹配的case分支', async () => {
    const action = {
      type: 'switch',
      value: '{{status}}',
      cases: [
        {
          match: 'pending',
          actions: [{ type: 'log', value: 'Pending action' }],
        },
        {
          match: 'approved',
          actions: [{ type: 'log', value: 'Approved action' }],
        },
      ],
    };

    const result = await switchAction(action, mockContext, mockExecutor);

    expect(result.matched).toBe(true);
    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
  });

  it('应该执行default分支当没有匹配', async () => {
    const action = {
      type: 'switch',
      value: '{{status}}',
      cases: [
        {
          match: 'approved',
          actions: [{ type: 'log', value: 'Approved' }],
        },
        {
          match: 'rejected',
          actions: [{ type: 'log', value: 'Rejected' }],
        },
      ],
      default: [{ type: 'log', value: 'Default action' }],
    };

    const result = await switchAction(action, mockContext, mockExecutor);

    expect(result.matched).toBe(false);
    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
  });

  it('应该匹配数字值', async () => {
    const action = {
      type: 'switch',
      value: '{{priority}}',
      cases: [
        { match: 1, actions: [{ type: 'log', value: 'Low' }] },
        { match: 2, actions: [{ type: 'log', value: 'Medium' }] },
        { match: 3, actions: [{ type: 'log', value: 'High' }] },
      ],
    };

    const result = await switchAction(action, mockContext, mockExecutor);

    expect(result.matched).toBe(true);
  });

  it('应该执行第一个匹配的case', async () => {
    const action = {
      type: 'switch',
      value: '{{status}}',
      cases: [
        { match: 'pending', actions: [{ type: 'log', value: 'First' }] },
        { match: 'pending', actions: [{ type: 'log', value: 'Second' }] },
      ],
    };

    await switchAction(action, mockContext, mockExecutor);

    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
  });
});

describe('loopAction', () => {
  let mockContext: any;
  let mockExecutor: any;

  beforeEach(() => {
    mockContext = {};
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该遍历数组', async () => {
    const action = {
      type: 'loop',
      over: [1, 2, 3],
      itemVar: 'item',
      actions: [{ type: 'log', value: '{{item}}' }],
    };

    const result = await loopAction(action, mockContext, mockExecutor);

    expect(result.count).toBe(3);
    expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
  });

  it('应该提供索引变量', async () => {
    const action = {
      type: 'loop',
      over: ['a', 'b', 'c'],
      itemVar: 'item',
      indexVar: 'index',
      actions: [{ type: 'log', value: '{{index}}' }],
    };

    const result = await loopAction(action, mockContext, mockExecutor);

    expect(result.count).toBe(3);
  });

  it('应该解析表达式数组', async () => {
    mockContext.items = [10, 20, 30];

    const action = {
      type: 'loop',
      over: '{{items}}',
      itemVar: 'item',
      actions: [{ type: 'log', value: '{{item}}' }],
    };

    const result = await loopAction(action, mockContext, mockExecutor);

    expect(result.count).toBe(3);
  });

  it('应该处理空数组', async () => {
    const action = {
      type: 'loop',
      over: [],
      itemVar: 'item',
      actions: [{ type: 'log', value: '{{item}}' }],
    };

    const result = await loopAction(action, mockContext, mockExecutor);

    expect(result.count).toBe(0);
    expect(mockExecutor.executeSingle).not.toHaveBeenCalled();
  });

  it('应该抛出错误当over不是数组', async () => {
    const action = {
      type: 'loop',
      over: 'not an array',
      itemVar: 'item',
      actions: [],
    };

    await expect(loopAction(action, mockContext, mockExecutor)).rejects.toThrow();
  });
});

describe('parallelAction', () => {
  let mockContext: any;
  let mockExecutor: any;

  beforeEach(() => {
    mockContext = {};
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该并行执行多个Actions', async () => {
    const action = {
      type: 'parallel',
      actions: [
        { type: 'log', value: 'Task 1' },
        { type: 'log', value: 'Task 2' },
        { type: 'log', value: 'Task 3' },
      ],
      waitAll: true,
    };

    const result = await parallelAction(action, mockContext, mockExecutor);

    expect(result.count).toBe(3);
    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(3);
  });

  it('应该等待所有Actions完成', async () => {
    let completedCount = 0;
    mockExecutor.executeSingle = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      completedCount++;
      return { success: true };
    });

    const action = {
      type: 'parallel',
      actions: [
        { type: 'log', value: 'Task 1' },
        { type: 'log', value: 'Task 2' },
      ],
      waitAll: true,
    };

    const result = await parallelAction(action, mockContext, mockExecutor);

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('应该处理部分失败', async () => {
    let callCount = 0;
    mockExecutor.executeSingle = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Task 2 failed');
      }
      return { success: true };
    });

    const action = {
      type: 'parallel',
      actions: [
        { type: 'log', value: 'Task 1' },
        { type: 'log', value: 'Task 2' },
        { type: 'log', value: 'Task 3' },
      ],
      waitAll: true,
    };

    const result = await parallelAction(action, mockContext, mockExecutor);

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('应该不等待当waitAll为false', async () => {
    const action = {
      type: 'parallel',
      actions: [
        { type: 'log', value: 'Task 1' },
        { type: 'log', value: 'Task 2' },
      ],
      waitAll: false,
    };

    const result = await parallelAction(action, mockContext, mockExecutor);

    expect(result.waitAll).toBe(false);
  });
});

describe('tryCatchAction', () => {
  let mockContext: any;
  let mockExecutor: any;

  beforeEach(() => {
    mockContext = {};
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该执行try块当没有错误', async () => {
    const action = {
      type: 'tryCatch',
      try: [{ type: 'log', value: 'Success' }],
      catch: [{ type: 'log', value: 'Error' }],
    };

    const result = await tryCatchAction(action, mockContext, mockExecutor);

    expect(result.success).toBe(true);
    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(1);
  });

  it('应该执行catch块当try块抛出错误', async () => {
    mockExecutor.executeSingle.mockRejectedValueOnce(new Error('Test error'));

    const action = {
      type: 'tryCatch',
      try: [{ type: 'log', value: 'Will fail' }],
      catch: [{ type: 'log', value: 'Caught' }],
    };

    const result = await tryCatchAction(action, mockContext, mockExecutor);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('应该执行finally块', async () => {
    const action = {
      type: 'tryCatch',
      try: [{ type: 'log', value: 'Try' }],
      catch: [],
      finally: [{ type: 'log', value: 'Finally' }],
    };

    await tryCatchAction(action, mockContext, mockExecutor);

    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(2); // try + finally
  });

  it('应该执行catch和finally当有错误', async () => {
    mockExecutor.executeSingle = vi.fn(async (action) => {
      if (action.value === 'Will fail') {
        throw new Error('Test error');
      }
    });

    const action = {
      type: 'tryCatch',
      try: [{ type: 'log', value: 'Will fail' }],
      catch: [{ type: 'log', value: 'Caught' }],
      finally: [{ type: 'log', value: 'Finally' }],
    };

    await tryCatchAction(action, mockContext, mockExecutor);

    expect(mockExecutor.executeSingle).toHaveBeenCalledTimes(3); // try + catch + finally
  });

  it('应该传递错误上下文到catch块', async () => {
    mockExecutor.executeSingle = vi.fn(async (action, context: any) => {
      if (context.error) {
        // catch块执行
        expect(context.error).toBeDefined();
        expect(context.errorObject).toBeInstanceOf(Error);
      } else {
        // try块执行
        throw new Error('Test error');
      }
    });

    const action = {
      type: 'tryCatch',
      try: [{ type: 'log', value: 'Will fail' }],
      catch: [{ type: 'log', value: '{{error}}' }],
    };

    await tryCatchAction(action, mockContext, mockExecutor);
  });
});

describe('边界情况', () => {
  it('应该处理空actions数组', async () => {
    const context = {} as any;
    const executor = createMockExecutor();

    // if with empty then
    const ifResult = await ifAction(
      { type: 'if', condition: true, then: [] },
      context,
      executor
    );
    expect(ifResult.branch).toBe('then');

    // switch with empty cases
    const switchResult = await switchAction(
      { type: 'switch', value: 'test', cases: [] },
      context,
      executor
    );
    expect(switchResult.matched).toBe(false);
  });

  it('应该处理复杂的嵌套流程', async () => {
    const context = { count: 0, items: [1, 2] } as any;
    const executor = createMockExecutor();

    // loop containing if
    const loopActionConfig = {
      type: 'loop',
      over: '{{items}}',
      itemVar: 'item',
      actions: [
        {
          type: 'if',
          condition: '{{item > 1}}',
          then: [{ type: 'log', value: 'Large item' }],
        },
      ],
    };

    const result = await loopAction(loopActionConfig, context, executor);
    expect(result.count).toBe(2);
  });
});
