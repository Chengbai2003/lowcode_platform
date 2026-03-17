/**
 * dataActions 单元测试
 * @module renderer/executor/actions/dataActions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setValue } from '../actions/dataActions';
import type { ExecutionContext } from '../../../types';
import type { ReactiveRuntime } from '../../reactive/runtime';

describe('dataActions - setValue', () => {
  // 创建基础测试上下文
  function createLegacyContext(
    initialData: Record<string, unknown> = {},
    initialState: Record<string, unknown> = {},
    initialFormData: Record<string, unknown> = {},
  ): ExecutionContext {
    return {
      data: { ...initialData },
      state: { ...initialState },
      formData: { ...initialFormData },
      user: { id: 'test-user', name: 'Test User', roles: [], permissions: [] },
      route: { path: '/', query: {}, params: {} },
      dispatch: vi.fn(),
      getState: vi.fn(),
      utils: {
        formatDate: vi.fn(),
        uuid: vi.fn(),
        clone: vi.fn((obj) => ({ ...obj })),
        debounce: vi.fn(),
        throttle: vi.fn(),
      },
      ui: {
        message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
        modal: {
          confirm: vi.fn(),
          info: vi.fn(),
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
        },
        notification: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
          info: vi.fn(),
        },
      },
      api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        request: vi.fn(),
      },
      navigate: vi.fn(),
      back: vi.fn(),
      // 不设置 runtime - 使用 legacy 路径
    } as ExecutionContext;
  }

  // 创建带 mock runtime 的上下文
  function createContextWithRuntime(): {
    context: ExecutionContext;
    mockRuntime: {
      get: any;
      set: any;
    };
  } {
    const mockRuntime = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
    };

    const context = createLegacyContext();
    (context as ExecutionContext & { runtime: ReactiveRuntime }).runtime =
      mockRuntime as unknown as ReactiveRuntime;

    return { context, mockRuntime };
  }

  describe('Legacy 路径（无 runtime）', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = createLegacyContext();
    });

    describe('基础写入到 data 命名空间', () => {
      it('应设置简单字段值', async () => {
        const result = await setValue(
          { type: 'setValue', field: 'username', value: 'John' },
          context,
        );

        expect(context.data.username).toBe('John');
        expect(result).toEqual({ field: 'username', value: 'John', merge: false });
      });

      it('应设置数字值', async () => {
        await setValue({ type: 'setValue', field: 'count', value: 42 }, context);

        expect(context.data.count).toBe(42);
      });

      it('应设置布尔值', async () => {
        await setValue({ type: 'setValue', field: 'active', value: true }, context);

        expect(context.data.active).toBe(true);
      });

      it('应设置 null 值', async () => {
        await setValue({ type: 'setValue', field: 'clearMe', value: null }, context);

        expect(context.data.clearMe).toBeNull();
      });

      it('应设置对象值', async () => {
        await setValue(
          { type: 'setValue', field: 'config', value: { theme: 'dark', lang: 'en' } },
          context,
        );

        expect(context.data.config).toEqual({ theme: 'dark', lang: 'en' });
      });
    });

    describe('写入到 state 命名空间', () => {
      it('应设置 state.loading', async () => {
        await setValue({ type: 'setValue', field: 'state.loading', value: true }, context);

        expect(context.state.loading).toBe(true);
      });

      it('应设置深层 state 路径', async () => {
        await setValue(
          { type: 'setValue', field: 'state.form.status', value: 'submitted' },
          context,
        );

        expect(context.state.form).toEqual({ status: 'submitted' });
      });
    });

    describe('深路径写入', () => {
      it('应写入到深层路径 formData.user.name', async () => {
        await setValue({ type: 'setValue', field: 'formData.user.name', value: 'Alice' }, context);

        expect(context.formData.user).toEqual({ name: 'Alice' });
      });

      it('应自动创建中间对象', async () => {
        await setValue({ type: 'setValue', field: 'a.b.c.d', value: 'deep' }, context);

        expect((context.data as Record<string, unknown>).a).toEqual({
          b: { c: { d: 'deep' } },
        });
      });

      it('应覆盖路径上的非对象值', async () => {
        context.data.existing = 'string-value';

        await setValue(
          { type: 'setValue', field: 'existing.nested', value: 'nested-value' },
          context,
        );

        expect(context.data.existing).toEqual({ nested: 'nested-value' });
      });
    });

    describe('merge 模式合并对象', () => {
      it('应合并对象而不是覆盖', async () => {
        context.data.user = { name: 'John', age: 25 };

        await setValue(
          { type: 'setValue', field: 'user', value: { city: 'NYC' }, merge: true },
          context,
        );

        expect(context.data.user).toEqual({ name: 'John', age: 25, city: 'NYC' });
      });

      it('merge 到不存在的字段应创建新对象', async () => {
        await setValue(
          { type: 'setValue', field: 'newObject', value: { key: 'value' }, merge: true },
          context,
        );

        expect(context.data.newObject).toEqual({ key: 'value' });
      });

      it('merge 到非对象字段应覆盖为新对象', async () => {
        context.data.stringField = 'text';

        await setValue(
          { type: 'setValue', field: 'stringField', value: { new: 'object' }, merge: true },
          context,
        );

        expect(context.data.stringField).toEqual({ new: 'object' });
      });

      it('merge 时应过滤危险键名', async () => {
        context.data.target = { existing: 'value' };

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
    });

    describe('原型污染防护', () => {
      it('应拒绝 __proto__ 键名', async () => {
        await expect(
          setValue({ type: 'setValue', field: '__proto__.polluted', value: 'yes' }, context),
        ).rejects.toThrow('forbidden key "__proto__"');
      });

      it('应拒绝 constructor 键名', async () => {
        await expect(
          setValue({ type: 'setValue', field: 'constructor.polluted', value: 'yes' }, context),
        ).rejects.toThrow('forbidden key "constructor"');
      });

      it('应拒绝 prototype 键名', async () => {
        await expect(
          setValue({ type: 'setValue', field: 'prototype.polluted', value: 'yes' }, context),
        ).rejects.toThrow('forbidden key "prototype"');
      });

      it('应拒绝路径中间的危险键名', async () => {
        await expect(
          setValue({ type: 'setValue', field: 'a.__proto__.b', value: 'value' }, context),
        ).rejects.toThrow('forbidden key "__proto__"');
      });

      it('应拒绝 merge 时的危险键名', async () => {
        await setValue(
          {
            type: 'setValue',
            field: 'target',
            value: { __proto__: 'bad', safe: 'ok' },
            merge: true,
          },
          context,
        );

        // merge 模式会过滤危险键而不是抛出错误
        expect(context.data.target).toEqual({ safe: 'ok' });
      });
    });

    describe('dispatch 和 markFullChange', () => {
      it('应调用 dispatch 发送 SET_FIELD action', async () => {
        await setValue({ type: 'setValue', field: 'test', value: 'value' }, context);

        expect(context.dispatch).toHaveBeenCalledWith({
          type: 'SET_FIELD',
          payload: { field: 'test', value: 'value', merge: false },
        });
      });

      it('应调用 markFullChange 通知响应式系统', async () => {
        const markFullChange = vi.fn();
        (context as ExecutionContext & { markFullChange: () => void }).markFullChange =
          markFullChange;

        await setValue({ type: 'setValue', field: 'test', value: 'value' }, context);

        expect(markFullChange).toHaveBeenCalled();
      });
    });

    describe('无效路径处理', () => {
      it('应拒绝空字段路径', async () => {
        await expect(
          setValue({ type: 'setValue', field: '', value: 'test' }, context),
        ).rejects.toThrow('invalid field path');
      });
    });
  });

  describe('Runtime 路径（有 runtime）', () => {
    let context: ExecutionContext;
    let mockRuntime: {
      get: any;
      set: any;
    };

    beforeEach(() => {
      const result = createContextWithRuntime();
      context = result.context;
      mockRuntime = result.mockRuntime;
    });

    it('应使用 runtime.set() 设置值', async () => {
      await setValue({ type: 'setValue', field: 'username', value: 'John' }, context);

      expect(mockRuntime.set).toHaveBeenCalledWith('username', 'John');
    });

    it('应使用 runtime.set() 设置 state 命名空间值', async () => {
      await setValue({ type: 'setValue', field: 'state.loading', value: true }, context);

      expect(mockRuntime.set).toHaveBeenCalledWith('state.loading', true);
    });

    it('merge 模式应先 get 再合并', async () => {
      mockRuntime.get.mockReturnValue({ name: 'John', age: 25 });

      await setValue(
        { type: 'setValue', field: 'user', value: { city: 'NYC' }, merge: true },
        context,
      );

      expect(mockRuntime.get).toHaveBeenCalledWith('user');
      expect(mockRuntime.set).toHaveBeenCalledWith('user', {
        name: 'John',
        age: 25,
        city: 'NYC',
      });
    });

    it('merge 模式目标为 null 时应直接设置', async () => {
      mockRuntime.get.mockReturnValue(null);

      await setValue(
        { type: 'setValue', field: 'newObject', value: { key: 'value' }, merge: true },
        context,
      );

      // null 被展开为空对象，然后合并新值
      expect(mockRuntime.set).toHaveBeenCalledWith('newObject', { key: 'value' });
    });

    it('merge 模式目标为 undefined 时应直接设置', async () => {
      mockRuntime.get.mockReturnValue(undefined);

      await setValue(
        { type: 'setValue', field: 'newObject', value: { key: 'value' }, merge: true },
        context,
      );

      expect(mockRuntime.set).toHaveBeenCalledWith('newObject', { key: 'value' });
    });

    it('不应调用 dispatch（runtime 负责通知）', async () => {
      await setValue({ type: 'setValue', field: 'test', value: 'value' }, context);

      expect(context.dispatch).not.toHaveBeenCalled();
    });

    it('不应调用 markFullChange（runtime 精准追踪）', async () => {
      const markFullChange = vi.fn();
      (context as ExecutionContext & { markFullChange: () => void }).markFullChange =
        markFullChange;

      await setValue({ type: 'setValue', field: 'test', value: 'value' }, context);

      expect(markFullChange).not.toHaveBeenCalled();
    });

    it('应返回正确的执行结果', async () => {
      const result = await setValue(
        { type: 'setValue', field: 'test', value: 'value', merge: true },
        context,
      );

      expect(result).toEqual({ field: 'test', value: 'value', merge: true });
    });

    it('merge 模式 value 为 null 时应直接设置', async () => {
      await setValue({ type: 'setValue', field: 'field', value: null, merge: true }, context);

      expect(mockRuntime.set).toHaveBeenCalledWith('field', null);
    });

    it('merge 模式 value 为非对象时应直接设置', async () => {
      await setValue({ type: 'setValue', field: 'count', value: 42, merge: true }, context);

      expect(mockRuntime.set).toHaveBeenCalledWith('count', 42);
    });
  });

  describe('值解析', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = createLegacyContext({ input1: 'hello' });
    });

    it('应直接返回字符串值', async () => {
      await setValue({ type: 'setValue', field: 'test', value: 'plain string' }, context);

      expect(context.data.test).toBe('plain string');
    });

    it('应解析数字值', async () => {
      await setValue({ type: 'setValue', field: 'count', value: 42 }, context);

      expect(context.data.count).toBe(42);
    });

    it('应解析对象值', async () => {
      await setValue(
        { type: 'setValue', field: 'config', value: { nested: { deep: 'value' } } },
        context,
      );

      expect(context.data.config).toEqual({ nested: { deep: 'value' } });
    });

    it('应解析数组值', async () => {
      await setValue({ type: 'setValue', field: 'items', value: [1, 2, 3] }, context);

      expect(context.data.items).toEqual([1, 2, 3]);
    });
  });
});
