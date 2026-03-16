import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { A2UISchema } from '../../types';
import { LowcodeProvider, Renderer, EventDispatcher } from '../';

/**
 * 跨组件响应式联动测试
 * 验证 Phase 1: 当组件 B 的值变化时，依赖 B 的组件 A 能正确重算表达式
 */

/** 等待 microtask flush（EventDispatcher 使用 queueMicrotask 批处理） */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const renderWithFlush = async (ui: ReactElement) => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(ui);
    await flushMicrotasks();
  });
  return result!;
};

// 启用 reactiveContext flag
beforeEach(() => {
  (window as any).__RENDERER_FLAGS__ = { reactiveContext: true };
});

describe('EventDispatcher subscribe mechanism', () => {
  it('subscribe and notify work correctly', async () => {
    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());
    const listener = vi.fn();
    const unsubscribe = dispatcher.subscribe(listener);

    expect(dispatcher.getVersion()).toBe(0);

    dispatcher.updateComponentData('input1', 'hello');
    // flush 是 microtask，需要等待
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dispatcher.getVersion()).toBe(1);

    dispatcher.updateComponentData('input2', 'world');
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(dispatcher.getVersion()).toBe(2);

    unsubscribe();
    dispatcher.updateComponentData('input3', 'test');
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(2); // 不再通知
  });

  it('changedKeys are immutable snapshots tied to version', async () => {
    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());

    dispatcher.updateComponentData('input1', 'a');
    dispatcher.updateComponentData('input2', 'b');
    await flushMicrotasks();

    const v = dispatcher.getVersion(); // 1（同一同步批次只 flush 一次）
    expect(v).toBe(1);

    const keys = dispatcher.getChangedKeysForVersion(0);
    expect(keys).not.toBe('all');
    expect((keys as Set<string>).has('input1')).toBe(true);
    expect((keys as Set<string>).has('input2')).toBe(true);

    // 再次读取同一 version，结果不变（不可变快照）
    const keys2 = dispatcher.getChangedKeysForVersion(0);
    expect(keys2).toEqual(keys);
  });

  it('markFullChange sets changedKeys to "all"', async () => {
    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());

    dispatcher.markFullChange();
    await flushMicrotasks();

    expect(dispatcher.getChangedKeysForVersion(0)).toBe('all');
  });

  it('batches multiple writes in same microtask into single flush', async () => {
    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());
    const listener = vi.fn();
    dispatcher.subscribe(listener);

    // 同步写入多次
    dispatcher.updateComponentData('a', '1');
    dispatcher.updateComponentData('b', '2');
    dispatcher.updateComponentData('c', '3');

    // flush 前 listener 不应被调用
    expect(listener).toHaveBeenCalledTimes(0);

    await flushMicrotasks();

    // 只 flush 一次
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dispatcher.getVersion()).toBe(1);

    const keys = dispatcher.getChangedKeysForVersion(0);
    expect(keys).not.toBe('all');
    expect((keys as Set<string>).size).toBe(3);
  });

  it('setComponentData keeps context/store aligned when dispatch throws after store update', async () => {
    const state = { components: { data: {} as Record<string, unknown> } };
    const dispatch = vi.fn((action: any) => {
      const { id, value } = action.payload as { id: string; value: unknown };
      state.components.data[id] = value;
      throw new Error('post-next failure');
    });

    const dispatcher = new EventDispatcher({}, dispatch, () => state);
    const setData = dispatcher.getExecutionContext().setComponentData;

    expect(() => setData?.('input1', 'value1')).toThrow('post-next failure');

    await flushMicrotasks();

    expect(dispatcher.getExecutionContext().data['input1']).toBe('value1');
    expect(dispatcher.getVersion()).toBe(1);
    const changed = dispatcher.getChangedKeysForVersion(0);
    expect(changed).not.toBe('all');
    expect((changed as Set<string>).has('input1')).toBe(true);
  });

  it('setComponentData leaves context unchanged when dispatch throws before store update', async () => {
    const state = { components: { data: {} as Record<string, unknown> } };
    const dispatch = vi.fn(() => {
      throw new Error('pre-next failure');
    });

    const dispatcher = new EventDispatcher({}, dispatch, () => state);
    const setData = dispatcher.getExecutionContext().setComponentData;

    expect(() => setData?.('input1', 'value1')).toThrow('pre-next failure');

    await flushMicrotasks();

    expect(dispatcher.getExecutionContext().data['input1']).toBeUndefined();
    expect(dispatcher.getVersion()).toBe(0);
    const changed = dispatcher.getChangedKeysForVersion(0);
    expect(changed).not.toBe('all');
    expect((changed as Set<string>).size).toBe(0);
  });

  it('initializes ReactiveRuntime with existing execution context namespaces', () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const dispatcher = new EventDispatcher(
      {
        data: { inputA: 'ready' },
        state: { loading: true },
        formData: { profile: { name: 'Alice' } },
        components: { root: { id: 'root', type: 'Div' } },
      },
      vi.fn(),
      vi.fn(),
    );

    const runtime = dispatcher.getRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime?.get('inputA')).toBe('ready');
    expect(runtime?.get('state.loading')).toBe(true);
    expect(runtime?.get('formData.profile.name')).toBe('Alice');
    expect(runtime?.get('components.root')).toEqual({ id: 'root', type: 'Div' });
  });

  it('keeps versioned changed keys when ReactiveRuntime is enabled', async () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());

    dispatcher.updateComponentData('input1', 'a');
    await flushMicrotasks();

    dispatcher.updateComponentData('input2', 'b');
    await flushMicrotasks();

    const firstFlush = dispatcher.getChangedKeysForVersion(0);
    expect(firstFlush).not.toBe('all');
    expect((firstFlush as Set<string>).has('input1')).toBe(true);
    expect((firstFlush as Set<string>).has('input2')).toBe(true);

    const secondFlush = dispatcher.getChangedKeysForVersion(1);
    expect(secondFlush).not.toBe('all');
    expect((secondFlush as Set<string>).has('input2')).toBe(true);
    expect((secondFlush as Set<string>).has('input1')).toBe(false);
  });

  it('syncs components into ReactiveRuntime when context updates later', async () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const dispatcher = new EventDispatcher({}, vi.fn(), vi.fn());
    dispatcher.setContext('components', {
      root: { id: 'root', type: 'Div' },
      button1: { id: 'button1', type: 'Button' },
    });

    await flushMicrotasks();

    const runtime = dispatcher.getRuntime();
    expect(runtime?.get('components.root')).toEqual({ id: 'root', type: 'Div' });
    expect(runtime?.get('components.button1')).toEqual({ id: 'button1', type: 'Button' });
  });

  it('passes runtime into DSL execution so later actions can read earlier writes', async () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const state = { components: { data: {} as Record<string, unknown> } };
    const dispatch = vi.fn((action: any) => {
      if (action.type?.endsWith('/setMultipleComponentData')) {
        state.components.data = { ...state.components.data, ...action.payload };
      }
    });

    const dispatcher = new EventDispatcher({}, dispatch, () => state);

    await dispatcher.execute([
      { type: 'setValue', field: 'input1', value: 'runtime-first' },
      { type: 'setValue', field: 'mirror', value: '{{ data.input1 }}' },
    ]);

    await flushMicrotasks();

    expect(dispatcher.getRuntime()?.get('input1')).toBe('runtime-first');
    expect(dispatcher.getRuntime()?.get('mirror')).toBe('runtime-first');
    expect(dispatcher.getExecutionContext().data.input1).toBe('runtime-first');
    expect(dispatcher.getExecutionContext().data.mirror).toBe('runtime-first');
    expect(state.components.data.input1).toBe('runtime-first');
    expect(state.components.data.mirror).toBe('runtime-first');
  });

  it('keeps runtime input writes mirrored to compatibility layers', async () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const state = { components: { data: {} as Record<string, unknown> } };
    const dispatch = vi.fn((action: any) => {
      if (action.type?.endsWith('/setComponentData')) {
        const { id, value } = action.payload as { id: string; value: unknown };
        state.components.data[id] = value;
      }

      if (action.type?.endsWith('/setMultipleComponentData')) {
        state.components.data = { ...state.components.data, ...action.payload };
      }
    });

    const dispatcher = new EventDispatcher({}, dispatch, () => state);

    dispatcher.updateComponentData('input1', 'hello-runtime');

    expect(dispatcher.getRuntime()?.get('input1')).toBe('hello-runtime');
    expect(dispatcher.getExecutionContext().data.input1).toBe('hello-runtime');
    expect(state.components.data.input1).toBe('hello-runtime');

    await flushMicrotasks();

    expect(dispatcher.getExecutionContext().data.input1).toBe('hello-runtime');
    expect(state.components.data.input1).toBe('hello-runtime');
  });
});

describe('Cross-component reactivity (Phase 1)', () => {
  it('uses schema initial values in runtime-driven expressions on first render', () => {
    (window as any).__RENDERER_FLAGS__ = {
      reactiveContext: true,
      useReactiveRuntime: true,
    };

    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['inputB', 'textA'],
        },
        inputB: {
          id: 'inputB',
          type: 'Input',
          props: { initialValue: 'show' },
        },
        textA: {
          id: 'textA',
          type: 'Span',
          props: {
            visible: "{{ data.inputB === 'show' }}",
            children: 'Visible from schema initial value',
          },
        },
      },
    };

    render(
      <LowcodeProvider>
        <Renderer schema={schema} />
      </LowcodeProvider>,
    );

    expect(screen.getByText('Visible from schema initial value')).toBeTruthy();
  });

  it('A.visible reacts to data.B change via eventDispatcher: hidden → visible', async () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['inputB', 'textA'],
        },
        inputB: {
          id: 'inputB',
          type: 'Input',
          props: { placeholder: 'type here', value: '' },
        },
        textA: {
          id: 'textA',
          type: 'Span',
          props: {
            visible: "{{ data.inputB === 'show' }}",
            children: 'I am visible',
          },
        },
      },
    };

    await renderWithFlush(
      <LowcodeProvider>
        <Renderer schema={schema} />
      </LowcodeProvider>,
    );

    // 初始：textA 不可见
    expect(screen.queryByText('I am visible')).toBeNull();

    // 模拟用户输入
    const input = screen.getByPlaceholderText('type here');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'show' } });
      await flushMicrotasks();
    });

    // 断言：textA 变为可见
    expect(screen.getByText('I am visible')).toBeTruthy();
  });

  it('A.visible reacts to data.B change: visible → hidden', async () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['inputB', 'textA'],
        },
        inputB: {
          id: 'inputB',
          type: 'Input',
          props: { placeholder: 'toggle input', value: '' },
        },
        textA: {
          id: 'textA',
          type: 'Span',
          props: {
            visible: "{{ data.inputB !== 'hide' }}",
            children: 'Conditionally visible',
          },
        },
      },
    };

    await renderWithFlush(
      <LowcodeProvider>
        <Renderer schema={schema} />
      </LowcodeProvider>,
    );

    // 初始：inputB 无值，表达式 data.inputB !== 'hide' 为 true，textA 可见
    expect(screen.getByText('Conditionally visible')).toBeTruthy();

    // 模拟用户输入 'hide' → textA 应消失
    const input = screen.getByPlaceholderText('toggle input');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'hide' } });
      await flushMicrotasks();
    });

    expect(screen.queryByText('Conditionally visible')).toBeNull();
  });

  it('static visible=false hides component', async () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['hidden'],
        },
        hidden: {
          id: 'hidden',
          type: 'Span',
          props: {
            visible: '{{ false }}',
            children: 'Should be hidden',
          },
        },
      },
    };

    await renderWithFlush(
      <LowcodeProvider>
        <Renderer schema={schema} />
      </LowcodeProvider>,
    );

    expect(screen.queryByText('Should be hidden')).toBeNull();
  });

  it('A.disabled reacts to data.B change via eventDispatcher', async () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['inputB', 'btn'],
        },
        inputB: {
          id: 'inputB',
          type: 'Input',
          props: { placeholder: 'lock input', value: '' },
        },
        btn: {
          id: 'btn',
          type: 'Button',
          props: {
            disabled: "{{ data.inputB === 'lock' }}",
            children: 'Click me',
          },
        },
      },
    };

    await renderWithFlush(
      <LowcodeProvider>
        <Renderer schema={schema} />
      </LowcodeProvider>,
    );

    // 初始：button 未禁用
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toHaveProperty('disabled', false);

    // 模拟用户输入 'lock' → button 应禁用
    const input = screen.getByPlaceholderText('lock input');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'lock' } });
      await flushMicrotasks();
    });

    expect(button).toHaveProperty('disabled', true);
  });
});
