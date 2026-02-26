/**
 * DSL执行引擎单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DSLExecutor } from "../../src/executor/Engine";
import type {
  Action,
  ExecutionContext,
  ExecutorOptions,
} from "@lowcode-platform/types";

describe("DSLExecutor", () => {
  let executor: DSLExecutor;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {
      data: {},
      formData: {},
      user: { id: "test", name: "Test User", roles: [], permissions: [] },
      route: { path: "/", query: {}, params: {} },
      state: {},
      dispatch: vi.fn(),
      getState: vi.fn(() => ({})),
      utils: {
        formatDate: vi.fn(),
        uuid: vi.fn(() => "test-uuid"),
        clone: vi.fn(<T>(obj: T) => JSON.parse(JSON.stringify(obj))),
        debounce: vi.fn(),
        throttle: vi.fn(),
      },
      ui: {
        message: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
          info: vi.fn(),
        },
        modal: {
          confirm: vi.fn(() => Promise.resolve(true)),
          info: vi.fn(() => Promise.resolve()),
          success: vi.fn(() => Promise.resolve()),
          error: vi.fn(() => Promise.resolve()),
          warning: vi.fn(() => Promise.resolve()),
        },
        notification: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
          info: vi.fn(),
        },
      },
      api: {
        get: vi.fn(<T = any>() => Promise.resolve({} as T)),
        post: vi.fn(<T = any>() => Promise.resolve({} as T)),
        put: vi.fn(<T = any>() => Promise.resolve({} as T)),
        delete: vi.fn(<T = any>() => Promise.resolve({} as T)),
        request: vi.fn(<T = any>() => Promise.resolve({} as T)),
      },
      navigate: vi.fn(),
      back: vi.fn(),
    };

    executor = new DSLExecutor({
      debug: false,
      maxExecutionTime: 5000,
      enableCustomScript: false,
      enablePlugins: false,
      onError: vi.fn(),
      onLog: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("应该执行单个Action", async () => {
      const actions: Action[] = [{ type: "log", value: "Test message" }];

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(1);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it("应该执行多个Actions", async () => {
      const actions: Action[] = [
        { type: "log", value: "Message 1" },
        { type: "log", value: "Message 2" },
        { type: "log", value: "Message 3" },
      ];

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(3);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it("应该处理Action执行失败", async () => {
      executor.registerHandler("failAction", async () => {
        throw new Error("Test error");
      });

      const actions: Action[] = [
        { type: "log", value: "Success" },
        { type: "failAction" } as any,
      ];

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(2);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBeInstanceOf(Error);
    });

    it("应该返回执行时间", async () => {
      const actions: Action[] = [{ type: "delay", ms: 100 } as any];

      const result = await executor.execute(actions, mockContext);

      expect(result.duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe("executeSingle", () => {
    it("应该执行单个Action", async () => {
      const action: Action = { type: "log", value: "Test" };

      const result = await executor.executeSingle(action, mockContext);

      expect(result).toBeDefined();
    });

    it("应该超时执行", async () => {
      const longRunningExecutor = new DSLExecutor({
        maxExecutionTime: 100,
      });

      longRunningExecutor.registerHandler("slowAction", () => {
        return new Promise((resolve) => setTimeout(resolve, 1000));
      });

      const action: Action = { type: "slowAction" } as any;

      await expect(
        longRunningExecutor.executeSingle(action, mockContext),
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe("registerHandler", () => {
    it("应该注册自定义Handler", async () => {
      const customHandler = vi.fn(async () => ({ success: true }));

      executor.registerHandler("customAction", customHandler);

      expect(executor.hasHandler("customAction")).toBe(true);

      const actions: Action[] = [{ type: "customAction" } as any];
      await executor.execute(actions, mockContext);

      expect(customHandler).toHaveBeenCalled();
    });

    it("应该覆盖已存在的Handler", async () => {
      const originalHandler = vi.fn();
      const newHandler = vi.fn();

      executor.registerHandler("testAction", originalHandler);
      executor.registerHandler("testAction", newHandler);

      const actions: Action[] = [{ type: "testAction" } as any];
      await executor.execute(actions, mockContext);

      expect(originalHandler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalled();
    });
  });

  describe("registerHandlers", () => {
    it("应该批量注册Handlers", async () => {
      const handlers = {
        action1: vi.fn(),
        action2: vi.fn(),
        action3: vi.fn(),
      };

      executor.registerHandlers(handlers);

      expect(executor.hasHandler("action1")).toBe(true);
      expect(executor.hasHandler("action2")).toBe(true);
      expect(executor.hasHandler("action3")).toBe(true);
    });

    it("应该与内置Handler合并", async () => {
      expect(executor.hasHandler("log")).toBe(true);
      expect(executor.hasHandler("message")).toBe(true);

      executor.registerHandlers({
        customAction: vi.fn(),
      });

      expect(executor.hasHandler("log")).toBe(true);
      expect(executor.hasHandler("customAction")).toBe(true);
    });
  });

  describe("getRegisteredHandlers", () => {
    it("应该返回所有已注册的Handler名称", () => {
      const handlers = executor.getRegisteredHandlers();

      expect(handlers).toContain("log");
      expect(handlers).toContain("message");
      expect(handlers).toContain("debug");
      expect(handlers.length).toBeGreaterThan(10);
    });
  });

  describe("hasHandler", () => {
    it("应该检查Handler是否存在", () => {
      expect(executor.hasHandler("log")).toBe(true);
      expect(executor.hasHandler("message")).toBe(true);
      expect(executor.hasHandler("nonexistent")).toBe(false);
    });
  });

  describe("执行上下文", () => {
    it("应该创建默认上下文", () => {
      const context = DSLExecutor.createContext();

      expect(context.data).toBeDefined();
      expect(context.formData).toBeDefined();
      expect(context.user).toBeDefined();
      expect(context.dispatch).toBeDefined();
      expect(context.getState).toBeDefined();
      expect(context.utils).toBeDefined();
      expect(context.ui).toBeDefined();
      expect(context.api).toBeDefined();
      expect(context.navigate).toBeDefined();
      expect(context.back).toBeDefined();
    });

    it("应该合并自定义上下文", () => {
      const custom = {
        customValue: "test",
        customFn: () => {},
      };

      const context = DSLExecutor.createContext(custom);

      expect(context.customValue).toBe("test");
      expect(context.customFn).toBeDefined();
      expect(context.data).toBeDefined(); // 默认值仍存在
    });

    it("应该覆盖默认上下文", () => {
      const custom = {
        data: { custom: "data" },
      };

      const context = DSLExecutor.createContext(custom);

      expect(context.data.custom).toBe("data");
    });
  });

  describe("配置选项", () => {
    it("应该使用debug模式", () => {
      const debugExecutor = new DSLExecutor({
        debug: true,
      });

      expect(debugExecutor).toBeDefined();
      // debug模式下的日志会在console中输出
    });

    it("应该使用自定义错误处理器", async () => {
      const onError = vi.fn();

      const errorExecutor = new DSLExecutor({
        onError,
      });

      errorExecutor.registerHandler("failAction", () => {
        throw new Error("Test error");
      });

      const actions: Action[] = [{ type: "failAction" } as any];
      await errorExecutor.execute(actions, mockContext);

      expect(onError).toHaveBeenCalled();
    });

    it("应该使用自定义日志处理器", async () => {
      const onLog = vi.fn();

      const logExecutor = new DSLExecutor({
        onLog,
      });

      const actions: Action[] = [{ type: "log", value: "Test" }];
      await logExecutor.execute(actions, mockContext);

      expect(onLog).toHaveBeenCalled();
    });

    it("应该支持自定义Handlers", async () => {
      const customHandler = vi.fn(async () => ({ result: "custom" }));

      const customExecutor = new DSLExecutor({
        customHandlers: {
          customAction: customHandler,
        },
      });

      expect(customExecutor.hasHandler("customAction")).toBe(true);

      const actions: Action[] = [{ type: "customAction" } as any];
      await customExecutor.execute(actions, mockContext);

      expect(customHandler).toHaveBeenCalled();
    });
  });

  describe("内置Actions", () => {
    it("应该有数据操作Actions", () => {
      expect(executor.hasHandler("setField")).toBe(true);
      expect(executor.hasHandler("mergeField")).toBe(true);
      expect(executor.hasHandler("clearField")).toBe(true);
    });

    it("应该有UI交互Actions", () => {
      expect(executor.hasHandler("message")).toBe(true);
      expect(executor.hasHandler("modal")).toBe(true);
      expect(executor.hasHandler("confirm")).toBe(true);
      expect(executor.hasHandler("notification")).toBe(true);
    });

    it("应该有导航Actions", () => {
      expect(executor.hasHandler("navigate")).toBe(true);
      expect(executor.hasHandler("openTab")).toBe(true);
      expect(executor.hasHandler("closeTab")).toBe(true);
      expect(executor.hasHandler("back")).toBe(true);
    });

    it("应该有状态管理Actions", () => {
      expect(executor.hasHandler("dispatch")).toBe(true);
      expect(executor.hasHandler("setState")).toBe(true);
      expect(executor.hasHandler("resetForm")).toBe(true);
    });

    it("应该有异步操作Actions", () => {
      expect(executor.hasHandler("apiCall")).toBe(true);
      expect(executor.hasHandler("delay")).toBe(true);
      expect(executor.hasHandler("waitCondition")).toBe(true);
    });

    it("应该有流程控制Actions", () => {
      expect(executor.hasHandler("if")).toBe(true);
      expect(executor.hasHandler("switch")).toBe(true);
      expect(executor.hasHandler("loop")).toBe(true);
      expect(executor.hasHandler("parallel")).toBe(true);
      expect(executor.hasHandler("sequence")).toBe(true);
      expect(executor.hasHandler("tryCatch")).toBe(true);
    });

    it("应该有调试Actions", () => {
      expect(executor.hasHandler("log")).toBe(true);
      expect(executor.hasHandler("debug")).toBe(true);
    });
  });

  describe("错误处理", () => {
    it("应该处理不存在的Action类型", async () => {
      const actions: Action[] = [{ type: "nonexistentAction" } as any];

      const result = await executor.execute(actions, mockContext);

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBeDefined();
    });

    it("应该继续执行后续Actions当有错误", async () => {
      let callCount = 0;

      executor.registerHandler("countAction", async () => {
        callCount++;
        return { count: callCount };
      });

      executor.registerHandler("failAction", () => {
        throw new Error("Test error");
      });

      const actions: Action[] = [
        { type: "countAction" } as any,
        { type: "failAction" } as any,
        { type: "countAction" } as any,
      ];

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(2);
      expect(callCount).toBe(2);
    });
  });

  describe("边界情况", () => {
    it("应该处理空Actions数组", async () => {
      const actions: Action[] = [];

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(0);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it("应该处理null和undefined值", async () => {
      executor.registerHandler(
        "testAction",
        async (_action: any, context: any) => {
          return context.testNull;
        },
      );

      const actions: Action[] = [{ type: "testAction" } as any];
      const result = await executor.execute(actions, {
        ...mockContext,
        testNull: null,
      } as any);

      expect(result.results[0].value).toBeNull();
    });

    it("应该处理特殊字符", async () => {
      executor.registerHandler("specialAction", async (action: any) => {
        return action.value;
      });

      const actions: Action[] = [
        { type: "specialAction", value: "!@#$%^&*()" } as any,
      ];
      const result = await executor.execute(actions, mockContext);

      expect(result.results[0].value).toBe("!@#$%^&*()");
    });

    it("应该处理unicode字符", async () => {
      executor.registerHandler("unicodeAction", async (action: any) => {
        return action.value;
      });

      const actions: Action[] = [
        { type: "unicodeAction", value: "你好世界" } as any,
      ];
      const result = await executor.execute(actions, mockContext);

      expect(result.results[0].value).toBe("你好世界");
    });

    it("应该处理极大的Actions数组", async () => {
      const actions: Action[] = Array.from({ length: 100 }, (_, i) => ({
        type: "log",
        value: `Message ${i}`,
      }));

      const result = await executor.execute(actions, mockContext);

      expect(result.total).toBe(100);
      expect(result.success).toBe(100);
    });
  });
});
