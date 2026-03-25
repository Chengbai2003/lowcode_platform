/**
 * dataActions 单元测试
 * @module renderer/executor/actions/dataActions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setValue } from '../actions/dataActions';
import { DSLExecutor } from '../Engine';
import type { ExecutionContext } from '../../../types';

describe('dataActions - setValue', () => {
  function createContext(
    initialData: Record<string, unknown> = {},
    initialState: Record<string, unknown> = {},
    initialFormData: Record<string, unknown> = {},
  ): ExecutionContext {
    return DSLExecutor.createContext({
      data: initialData,
      state: initialState,
      formData: initialFormData,
      user: { id: 'test-user', name: 'Test User', roles: [], permissions: [] },
      route: { path: '/', query: {}, params: {} },
      dispatch: vi.fn(),
      getState: vi.fn(),
      components: {
        username: { id: 'username' },
        user: { id: 'user' },
      },
    });
  }

  let context: ExecutionContext;

  beforeEach(() => {
    context = createContext();
  });

  it('sets a simple value in the data namespace', async () => {
    const result = await setValue({ type: 'setValue', field: 'username', value: 'John' }, context);

    expect(context.runtime.get('username')).toBe('John');
    expect(context.data.username).toBe('John');
    expect(result).toEqual({ field: 'username', value: 'John', merge: false });
  });

  it('sets values in state and formData namespaces', async () => {
    await setValue({ type: 'setValue', field: 'state.loading', value: true }, context);
    await setValue({ type: 'setValue', field: 'formData.user.name', value: 'Alice' }, context);

    expect(context.runtime.get('state.loading')).toBe(true);
    expect(context.state.loading).toBe(true);
    expect(context.runtime.get('formData.user.name')).toBe('Alice');
    expect((context.formData.user as Record<string, unknown>).name).toBe('Alice');
  });

  it('creates deep objects under the data namespace', async () => {
    await setValue({ type: 'setValue', field: 'a.b.c.d', value: 'deep' }, context);

    expect(context.runtime.get('a.b.c.d')).toBe('deep');
    expect((context.data.a as Record<string, unknown>).b).toEqual({
      c: { d: 'deep' },
    });
  });

  it('merges objects through runtime.get + runtime.set', async () => {
    context = createContext({ user: { name: 'John', age: 25 } });
    const getSpy = vi.spyOn(context.runtime, 'get');
    const setSpy = vi.spyOn(context.runtime, 'set');

    await setValue(
      { type: 'setValue', field: 'user', value: { city: 'NYC' }, merge: true },
      context,
    );

    expect(getSpy).toHaveBeenCalledWith('user');
    expect(setSpy).toHaveBeenCalledWith('user', { name: 'John', age: 25, city: 'NYC' });
    expect(context.data.user).toEqual({ name: 'John', age: 25, city: 'NYC' });
  });

  it('filters unsafe keys during merge', async () => {
    context = createContext({ target: { existing: 'value' } });

    await setValue(
      {
        type: 'setValue',
        field: 'target',
        value: { __proto__: 'bad', constructor: 'evil', safe: 'ok' },
        merge: true,
      },
      context,
    );

    expect(context.data.target).toEqual({ existing: 'value', safe: 'ok' });
    expect(context.data.target).not.toHaveProperty('__proto__');
    expect(context.data.target).not.toHaveProperty('constructor');
  });

  it('rejects unsafe field paths', async () => {
    await expect(
      setValue({ type: 'setValue', field: '__proto__.polluted', value: 'yes' }, context),
    ).rejects.toThrow('forbidden key "__proto__"');
    await expect(
      setValue({ type: 'setValue', field: 'constructor.polluted', value: 'yes' }, context),
    ).rejects.toThrow('forbidden key "constructor"');
    await expect(
      setValue({ type: 'setValue', field: 'prototype.polluted', value: 'yes' }, context),
    ).rejects.toThrow('forbidden key "prototype"');
  });

  it('rejects empty field paths', async () => {
    await expect(setValue({ type: 'setValue', field: '', value: 'test' }, context)).rejects.toThrow(
      'invalid field path',
    );
  });

  it('does not call host dispatch for runtime writes', async () => {
    const dispatch = vi.fn();
    context = createContext();
    context.dispatch = dispatch;

    await setValue({ type: 'setValue', field: 'username', value: 'John' }, context);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
