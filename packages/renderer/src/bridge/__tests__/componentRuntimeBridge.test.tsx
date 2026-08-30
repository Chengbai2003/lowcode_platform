import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EventDispatcher } from '../../EventDispatcher';
import { createComponentRuntimeBridge } from '../createComponentRuntimeBridge';
import {
  ComponentRuntimeBridgeContext,
  useComponentRuntimeBridge,
} from '../ComponentRuntimeBridgeContext';

describe('createComponentRuntimeBridge (M0-4 Scope C)', () => {
  it('resolveValue merges dispatcher context with row-level scope', () => {
    const dispatcher = new EventDispatcher({ data: { currentUser: 'tester' } });
    const bridge = createComponentRuntimeBridge(dispatcher);

    expect(bridge.resolveValue('{{record.name}}', { record: { name: 'Alice' } })).toBe('Alice');
  });

  it('executeActions delegates to the dispatcher with merged extra context', async () => {
    const dispatcher = new EventDispatcher({});
    const spy = vi.spyOn(dispatcher, 'execute').mockResolvedValue('ok');
    const bridge = createComponentRuntimeBridge(dispatcher);

    await expect(
      bridge.executeActions([{ type: 'navigate', to: '/users' }], undefined, { record: { id: 1 } }),
    ).resolves.toBe('ok');
    expect(spy).toHaveBeenCalledWith([{ type: 'navigate', to: '/users' }], undefined, {
      record: { id: 1 },
    });
  });

  it('executeActions fails closed when the renderer runtime is not attached', async () => {
    const bridge = createComponentRuntimeBridge(undefined);

    await expect(bridge.executeActions([], undefined)).rejects.toThrow(
      'renderer runtime is not attached',
    );
  });

  it('getResource denies by default with a frozen error state (M1b 前 fail-close)', () => {
    const bridge = createComponentRuntimeBridge(new EventDispatcher({}));
    const state = bridge.getResource('res-1');

    expect(state.status).toBe('error');
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('context returns null outside a Renderer and the injected bridge inside', () => {
    const { result: outside } = renderHook(() => useComponentRuntimeBridge());
    expect(outside.current).toBeNull();

    const bridge = createComponentRuntimeBridge(new EventDispatcher({}));
    const { result: inside } = renderHook(() => useComponentRuntimeBridge(), {
      wrapper: ({ children }) => (
        <ComponentRuntimeBridgeContext.Provider value={bridge}>
          {children}
        </ComponentRuntimeBridgeContext.Provider>
      ),
    });
    expect(inside.current).toBe(bridge);
  });
});
