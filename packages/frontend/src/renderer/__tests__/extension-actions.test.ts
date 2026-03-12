import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DSLExecutor } from '../executor';
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
});
