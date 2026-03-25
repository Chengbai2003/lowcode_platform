import { afterEach, describe, expect, it, vi } from 'vitest';
import { DSLExecutor } from '../executor';
import { EventDispatcher } from '../EventDispatcher';
import { customScript } from '../executor/actions/extensionActions';
import type { CustomScriptAction, ExecutionContext } from '../../types';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return DSLExecutor.createContext(overrides);
}

describe('extensionActions customScript', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows $.set for component IDs from context.components', async () => {
    const context = createExecutionContext({
      components: {
        inputB: { id: 'inputB' },
      },
    });

    const action: CustomScriptAction = {
      type: 'customScript',
      code: "$.set('inputB', 'hello')",
    };

    await customScript(action, context);

    expect(context.runtime.get('inputB')).toBe('hello');
    expect(context.data.inputB).toBe('hello');
  });

  it('allows $.patch and updates runtime in one batch', async () => {
    const context = createExecutionContext({
      components: {
        inputA: { id: 'inputA' },
        inputB: { id: 'inputB' },
      },
    });

    await customScript(
      {
        type: 'customScript',
        code: "$.patch({ inputA: 'A', inputB: 'B' })",
      },
      context,
    );

    expect(context.runtime.get('inputA')).toBe('A');
    expect(context.runtime.get('inputB')).toBe('B');
  });

  it('reads frozen runtime snapshots inside the sandbox', async () => {
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

    await expect(
      customScript(
        {
          type: 'customScript',
          code: "data.profile.name = 'bob'; return data.profile.name",
        },
        context,
      ),
    ).resolves.toBe('alice');
    expect((context.data as any).profile.name).toBe('alice');
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

      await expect(
        customScript(
          {
            type: 'customScript',
            code: 'return data.profile.name',
          },
          context,
        ),
      ).resolves.toBe('alice');
    } finally {
      (globalThis as any).structuredClone = originalStructuredClone;
    }
  });

  it('blocks dynamic import escape hatch', async () => {
    const context = createExecutionContext();

    await expect(
      customScript(
        {
          type: 'customScript',
          code: "return import('data:text/javascript,export default 1')",
        },
        context,
      ),
    ).rejects.toThrow('Dynamic import is not allowed in customScript');
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

    const result = await executor.execute(
      [
        {
          type: 'customScript',
          code: 'return "evil"',
        },
      ],
      createExecutionContext({
        data: { input1: 'test' },
      }),
    );

    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect((result.results[0] as any).error?.message).toContain('customScript is disabled');
  });

  it('allows customScript when explicitly enabled', async () => {
    const executor = new DSLExecutor({
      enableCustomScript: true,
    });

    const result = await executor.execute(
      [
        {
          type: 'customScript',
          code: 'return data.input1',
        },
      ],
      createExecutionContext({
        data: { input1: 'test' },
      }),
    );

    expect(result.success).toBe(1);
    expect(result.results[0].success).toBe(true);
    expect((result.results[0] as any).value).toBe('test');
  });

  it('keeps customScript enabled in renderer EventDispatcher path', async () => {
    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());

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
