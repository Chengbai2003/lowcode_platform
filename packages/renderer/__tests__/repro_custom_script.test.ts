import { describe, it, expect, vi } from "vitest";
import { DSLExecutor } from "../src/executor/Engine";

describe("Custom Script (Deprecated)", () => {
  it("should warn when using deprecated customScript action", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const executor = new DSLExecutor({
      enableCustomScript: true,
    });

    const action = {
      type: "customScript",
      code: "1 + 1", // 简单的表达式
    };

    const context = DSLExecutor.createContext({});

    // customScript 是废弃功能，但仍然可以执行（向后兼容）
    // 它会输出废弃警告
    await executor.executeSingle(action as any, context);

    // 验证废弃警告被输出（来自 Engine 的 deprecated handler）
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));

    warnSpy.mockRestore();
  });

  it("should validate code safety in customScript", async () => {
    const executor = new DSLExecutor({
      enableCustomScript: true,
    });

    const action = {
      type: "customScript",
      code: 'eval("alert(1)")', // 危险代码
    };

    const context = DSLExecutor.createContext({});

    // 危险代码应该被拒绝
    await expect(
      executor.executeSingle(action as any, context),
    ).rejects.toThrow("Code validation failed");
  });
});
