import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DSLExecutor } from '../executor';
import { EventDispatcher } from '../EventDispatcher';
import { customScript } from '../executor/actions/extensionActions';
import type { CustomScriptAction, ExecutionContext } from '../../types';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return DSLExecutor.createContext(overrides) as ExecutionContext;
}

describe('extensionActions customScript (capability mode)', () => {
  beforeEach(() => {
    (window as any).__RENDERER_FLAGS__ = { capabilityScript: true };
  });

  afterEach(() => {
    delete (window as any).__RENDERER_FLAGS__;
    vi.restoreAllMocks();
  });

  it('allows $.set for component IDs from context.components even when data is empty', async () => {
    const setComponentData = vi.fn();
    const markFullChange = vi.fn();

    const context = createExecutionContext({
      data: {},
      components: {
        inputB: { id: 'inputB' },
      },
      setComponentData,
      markFullChange,
    });

    const action: CustomScriptAction = {
      type: 'customScript',
      code: "$.set('inputB', 'hello')",
    };

    await customScript(action, context);

    expect(setComponentData).toHaveBeenCalledWith('inputB', 'hello');
    expect(markFullChange).toHaveBeenCalledTimes(1);
  });

  it('falls back when structuredClone is unavailable', async () => {
    const originalStructuredClone = (globalThis as any).structuredClone;

    try {
      (globalThis as any).structuredClone = undefined;

      const context = createExecutionContext({
        data: {
          profile: {
            name: 'alice',
          },
        },
        components: {
          profile: { id: 'profile' },
        },
      });

      const action: CustomScriptAction = {
        type: 'customScript',
        code: 'return data.profile.name',
      };

      await expect(customScript(action, context)).resolves.toBe('alice');
    } finally {
      (globalThis as any).structuredClone = originalStructuredClone;
    }
  });

  it('keeps frozen sandbox data immutable', async () => {
    const context = createExecutionContext({
      data: {
        profile: {
          name: 'alice',
        },
      },
      components: {
        profile: { id: 'profile' },
      },
    });

    const action: CustomScriptAction = {
      type: 'customScript',
      code: "data.profile.name = 'bob'; return data.profile.name",
    };

    await expect(customScript(action, context)).resolves.toBe('alice');
    expect((context.data as any).profile.name).toBe('alice');
  });

  it('blocks dynamic import escape hatch', async () => {
    const context = createExecutionContext();

    const action: CustomScriptAction = {
      type: 'customScript',
      code: "return import('data:text/javascript,export default 1')",
    };

    await expect(customScript(action, context)).rejects.toThrow(
      'Dynamic import is not allowed in customScript',
    );
  });
});

describe('enableCustomScript security check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws error when customScript is disabled (default)', async () => {
    const executor = new DSLExecutor({
      enableCustomScript: false,
    });

    const context = createExecutionContext({
      data: { input1: 'test' },
    });

    const action: CustomScriptAction = {
      type: 'customScript',
      code: 'return "evil"',
    };

    // executor.execute 返回 BatchActionResult，错误在 results 数组中
    const result = await executor.execute([action], context);

    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect((result.results[0] as any).error?.message).toContain('customScript is disabled');
  });

  it('allows customScript when explicitly enabled', async () => {
    const executor = new DSLExecutor({
      enableCustomScript: true,
    });

    const context = createExecutionContext({
      data: { input1: 'test' },
    });

    const action: CustomScriptAction = {
      type: 'customScript',
      code: 'return data.input1',
    };

    // executor.execute 返回 BatchActionResult，结果在 results[0].value 中
    const result = await executor.execute([action], context);

    expect(result.success).toBe(1);
    expect(result.results[0].success).toBe(true);
    expect((result.results[0] as any).value).toBe('test');
  });

  it('keeps customScript enabled in renderer EventDispatcher path', async () => {
    const dispatch = vi.fn();
    const state = { components: { data: {} as Record<string, unknown> } };
    const dispatcher = new EventDispatcher({}, dispatch, () => state);

    const result = await dispatcher.execute(
      [
        {
          type: 'customScript',
          code: 'return 42',
        },
      ],
      undefined,
    );

    expect(result.success).toBe(1);
    expect((result.results[0] as any).value).toBe(42);
  });
});
