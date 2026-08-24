import { describe, expect, it, vi } from 'vitest';
import { DSLExecutor } from '../executor';
import { EventDispatcher } from '../EventDispatcher';
import type { ExecutionContext } from '../../types';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return DSLExecutor.createContext(overrides);
}

describe('customScript permanently disabled', () => {
  it('rejects direct execution', async () => {
    const executor = new DSLExecutor();
    const result = await executor.execute(
      [{ type: 'customScript', code: "$.set('inputB', 'hello')" } as any],
      createExecutionContext({ components: { inputB: { id: 'inputB' } } }),
    );
    expect(result.failed).toBe(1);
    expect((result.results[0] as any).error?.message).toContain('in-realm execution is unsafe');
  });

  it('rejects constructor customHandlers.customScript', async () => {
    const handler = vi.fn();
    expect(() => new DSLExecutor({ customHandlers: { customScript: handler } as any })).toThrow(
      'customScript is permanently disabled',
    );
  });

  it('rejects registerHandler customScript', async () => {
    const executor = new DSLExecutor();
    const handler = vi.fn();
    expect(() => executor.registerHandler('customScript', handler as any)).toThrow(
      'customScript is permanently disabled',
    );
    expect(executor.hasHandler('customScript')).toBe(false);
  });

  it('rejects registerHandlers customScript atomically', async () => {
    const executor = new DSLExecutor();
    const okHandler = vi.fn();
    const badHandler = vi.fn();
    expect(() =>
      executor.registerHandlers({ myCustomOk: okHandler as any, customScript: badHandler as any }),
    ).toThrow('customScript is permanently disabled');
    // other handler should not be partially registered
    expect(executor.hasHandler('myCustomOk')).toBe(false);
    expect(executor.hasHandler('customScript')).toBe(false);
  });

  it('rejects customScript even when legacy enableCustomScript true is passed', async () => {
    const executor = new DSLExecutor({ enableCustomScript: true } as any);
    const result = await executor.execute(
      [{ type: 'customScript', code: 'return data.input1' } as any],
      createExecutionContext({ data: { input1: 'test' } }),
    );
    expect(result.failed).toBe(1);
    expect((result.results[0] as any).error?.message).toContain('in-realm execution is unsafe');
  });

  it('rejects constructor escapes via EventDispatcher', async () => {
    const marker = '__CUSTOM_SCRIPT_PWNED__';
    Reflect.deleteProperty(globalThis, marker);
    const dispatcher = new EventDispatcher({} as any, vi.fn(), vi.fn());
    const result = await dispatcher.execute(
      [
        {
          type: 'customScript',
          code: `({}).constructor.constructor('return globalThis')().${marker} = true`,
        } as any,
      ],
      undefined,
    );
    expect(result.failed).toBe(1);
    expect((result.results[0] as any).error?.message).toContain('in-realm execution is unsafe');
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it('rejects executeSingle customScript', async () => {
    const executor = new DSLExecutor();
    await expect(
      executor.executeSingle(
        { type: 'customScript', code: 'alert(1)' } as any,
        createExecutionContext(),
      ),
    ).rejects.toThrow('in-realm execution is unsafe');
  });
});
