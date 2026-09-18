import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LowcodeProvider, Renderer, RENDERER_VERSION } from '@lowcode-platform/renderer';
import { createTestPreset, testPreset, TEST_RUNTIME_COMPATIBILITY } from '../createTestPreset';
import {
  testRuntime,
  message as testRuntimeMessage,
  notification as testRuntimeNotification,
  Button as TestButton,
  Container as TestContainer,
  Text as TestText,
} from '../runtime';
import { testManifest } from '../manifest';
import { testCompilerBindings } from '../compiler';
import { testValidation } from '../validation';

function schemaWith(props: Record<string, unknown>) {
  return {
    schemaVersion: 0 as const,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Container', childrenIds: ['n1'] },
      n1: { id: 'n1', type: 'Button', props },
    },
  };
}

describe('testPreset seal 语义（Bootstrap 后不可变）', () => {
  it('整棵 Registry 结构深冻结，且每个 runtime 组件都有 Manifest 条目', () => {
    expect(Object.isFrozen(testPreset)).toBe(true);
    expect(Object.isFrozen(testPreset.runtime)).toBe(true);
    expect(Object.isFrozen(testPreset.manifest)).toBe(true);
    expect(Object.isFrozen(testPreset.compiler)).toBe(true);
    expect(Object.isFrozen(testPreset.compiler.componentSources)).toBe(true);

    for (const type of Object.keys(testPreset.runtime)) {
      const entry = testPreset.manifest[type];
      expect(entry, `manifest entry for ${type}`).toBeDefined();
      expect(Object.isFrozen(entry!.allowedProps)).toBe(true);
    }
  });

  it('createTestPreset 返回新的 frozen 实例（内容共享）', () => {
    const fresh = createTestPreset();
    expect(fresh).not.toBe(testPreset);
    expect(fresh.runtime).not.toBe(testPreset.runtime);
    expect(fresh.runtime.Button).toBe(testPreset.runtime.Button);
    expect(Object.isFrozen(fresh)).toBe(true);
    expect(() => {
      (fresh as { id: string }).id = 'tampered';
    }).toThrow();
  });

  it('runtime / manifest / compiler 三方组件键集合完全一致', () => {
    const runtimeKeys = Object.keys(testRuntime).sort();
    expect(Object.keys(testManifest).sort()).toEqual(runtimeKeys);
    expect(Object.keys(testCompilerBindings.componentSources ?? {}).sort()).toEqual(runtimeKeys);
    expect(Object.keys(testCompilerBindings.componentBindings ?? {}).sort()).toEqual(runtimeKeys);
    expect(Object.keys(testValidation).sort()).toEqual([]);
  });

  it('版本常量与 preset 身份及 Renderer 版本精确对齐', () => {
    expect(testPreset.id).toBe('builtin-test');
    expect(testPreset.version).toBe('0.1.0');
    expect(TEST_RUNTIME_COMPATIBILITY).toEqual({
      componentPresetId: testPreset.id,
      componentPresetVersion: testPreset.version,
      rendererVersion: RENDERER_VERSION,
    });
  });

  it('compiler 绑定覆盖全部 runtime 组件并指向本包 /runtime 子路径，禁止默认库回退', () => {
    for (const type of Object.keys(testRuntime)) {
      expect(testCompilerBindings.componentSources[type]).toBe(
        '@lowcode-platform/preset-test/runtime',
      );
      expect(testCompilerBindings.componentBindings?.[type]).toEqual({
        module: '@lowcode-platform/preset-test/runtime',
      });
    }
    expect(testCompilerBindings.allowDefaultComponentFallback).toBe(false);
  });

  it('runtime 导出 Compiler feedback 动作依赖的最小 message 实现', () => {
    expect(testRuntimeMessage).toBeDefined();
    expect(Object.isFrozen(testRuntimeMessage)).toBe(true);
    for (const level of ['success', 'error', 'warning', 'info']) {
      expect(typeof testRuntimeMessage[level as keyof typeof testRuntimeMessage]).toBe('function');
    }
  });
});

describe('testPreset 渲染（可辨识 DOM 标记，经真实 Renderer）', () => {
  it('Container/Text/Button 渲染带 data-preset-test 标记与等宽虚线样式', () => {
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-marker-test"
        documentSessionId="doc-1"
        schema={
          {
            schemaVersion: 0,
            rootId: 'root',
            components: {
              root: {
                id: 'root',
                type: 'Container',
                childrenIds: ['t1', 'b1'],
                props: { width: 'sm' },
              },
              t1: { id: 't1', type: 'Text', props: { children: 'preset-test 文本', strong: true } },
              b1: { id: 'b1', type: 'Button', props: { children: '测试按钮', variant: 'solid' } },
            },
          } as never
        }
      />,
    );

    const root = container.querySelector('[data-preset-test="container"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('style')).toContain('monospace');
    expect(root!.getAttribute('style')).toContain('640px');

    const text = container.querySelector('[data-preset-test="text"]');
    expect(text!.textContent).toBe('preset-test 文本');
    expect(text!.getAttribute('style')).toContain('700');

    const button = screen.getByRole('button', { name: '测试按钮' });
    expect(button.getAttribute('data-preset-test')).toBe('button');
    expect(button.getAttribute('data-variant')).toBe('solid');
    const buttonStyle = button.getAttribute('style') ?? '';
    expect(buttonStyle).toContain('dashed');
    expect(buttonStyle).toContain('monospace');
  });

  it('与 AntD 同名的 Button 不携带任何 ant-* 类名，错误挂到 AntD 时可通过标记暴露', () => {
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-no-antd-test"
        documentSessionId="doc-1"
        schema={schemaWith({ children: '纯净按钮' }) as never}
      />,
    );
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.className).not.toMatch(/ant-/);
    // 本 Preset 的 DOM 标记必须存在；AntD Button 不带该标记
    expect(button!.hasAttribute('data-preset-test')).toBe(true);
  });
});

describe('testPreset Props 净化（fail-close，经 Renderer 端到端）', () => {
  it('白名单外 Props 与危险 DOM Props 不进入组件', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-sanitize-test"
        documentSessionId="doc-1"
        schema={
          schemaWith({
            className: 'kept',
            variant: 'outline',
            'data-unknown': 'x',
            htmlType: 'submit',
            dangerouslySetInnerHTML: { __html: '<b>poison</b>' },
          }) as never
        }
      />,
    );
    const button = container.querySelector('button');
    expect(button!.classList.contains('kept')).toBe(true);
    expect(button!.hasAttribute('data-unknown')).toBe(false);
    expect(button!.getAttribute('htmltype')).toBeNull();
    expect(button!.getAttribute('type')).toBe('button');
    expect(container.querySelector('b')).toBeNull();
    warn.mockRestore();
  });

  it('AntD 专属 Props（loading/danger）在 Manifest 层被过滤，不进入 DOM', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-antd-props-test"
        documentSessionId="doc-1"
        schema={schemaWith({ children: '边界', loading: true, danger: true }) as never}
      />,
    );
    const button = container.querySelector('button')!;
    expect(button.hasAttribute('loading')).toBe(false);
    expect(button.hasAttribute('danger')).toBe(false);
    expect(button.textContent).toBe('边界');
    warn.mockRestore();
  });

  it('可执行函数 Props 在 Contract 层即被永久拒绝（先于 Manifest 净化）', () => {
    expect(() =>
      render(
        <Renderer
          preset={testPreset}
          pageId="p-fn-props-test"
          documentSessionId="doc-1"
          schema={
            schemaWith({ render: (() => null) as unknown as Record<string, unknown> }) as never
          }
        />,
      ),
    ).toThrow(/Functions are permanently forbidden/);
  });

  it('允许的 Props 正常生效：disabled / block / size', () => {
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-props-test"
        documentSessionId="doc-1"
        schema={
          {
            schemaVersion: 0,
            rootId: 'root',
            components: {
              root: {
                id: 'root',
                type: 'Container',
                childrenIds: ['t1', 'b1'],
              },
              t1: { id: 't1', type: 'Text', props: { children: '大字', size: 'xl' } },
              b1: {
                id: 'b1',
                type: 'Button',
                props: { children: '禁用', disabled: true, block: true },
              },
            },
          } as never
        }
      />,
    );
    const text = container.querySelector('[data-preset-test="text"]');
    expect(text!.getAttribute('data-size')).toBe('xl');
    expect(text!.getAttribute('style')).toContain('28px');

    const button = container.querySelector('button');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button!.getAttribute('style')).toContain('100%');
  });
});

describe('testPreset 交互（events 机制，不直接调用执行器）', () => {
  it('Button 点击经 Renderer events 派发 feedback action', async () => {
    const message = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };
    render(
      <LowcodeProvider>
        <Renderer
          preset={testPreset}
          pageId="p-click-test"
          documentSessionId="doc-1"
          schema={
            {
              schemaVersion: 0,
              rootId: 'root',
              components: {
                root: { id: 'root', type: 'Container', childrenIds: ['b1'] },
                b1: {
                  id: 'b1',
                  type: 'Button',
                  props: { children: '触发消息' },
                  events: {
                    onClick: [
                      {
                        type: 'feedback',
                        kind: 'message',
                        content: 'preset-test 操作成功',
                        level: 'success',
                      },
                    ],
                  },
                },
              },
            } as never
          }
          eventContext={{ ui: { message } }}
        />
      </LowcodeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '触发消息' }));

    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith('preset-test 操作成功');
    });
  });
});

describe('testPreset 组件自防御（Compiler 生成代码直接消费路径，无 Renderer 净化）', () => {
  it('字符串型 on* 与危险 HTML Props 不透传 DOM', () => {
    // Compiler 生成代码会把 Schema Props 原样作为 JSX 属性传入组件；
    // 这里绕过 Renderer 直接渲染组件，验证组件自身的 fail-close。
    const { container } = render(
      <TestButton
        children={'危险按钮'}
        onerror={'alert(1)'}
        onError={'alert(1)'}
        dangerouslySetInnerHTML={{ __html: '<b>poison</b>' }}
        href={'javascript:alert(1)'}
        className={'kept-class'}
      />,
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('危险按钮');
    expect(button.hasAttribute('onerror')).toBe(false);
    expect(button.getAttribute('onerror')).toBeNull();
    expect(button.hasAttribute('href')).toBe(false);
    expect(container.querySelector('b')).toBeNull();
    expect(button.classList.contains('kept-class')).toBe(true);
  });

  it('函数型 on[A-Z] handler（events 机制合法形态）正常透传', () => {
    const onClick = vi.fn();
    const { container } = render(<TestButton children={'合法事件'} onClick={onClick} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Container/Text 同样只透传白名单标量属性', () => {
    const { container } = render(
      <div>
        <TestContainer id={'c1'} data-evil={'x'} onerror={'y'} />
        <TestText title={'t1'} data-evil={'x'} onerror={'y'} />
      </div>,
    );
    const containerEl = container.querySelector('[data-preset-test="container"]')!;
    expect(containerEl.id).toBe('c1');
    expect(containerEl.hasAttribute('data-evil')).toBe(false);
    const textEl = container.querySelector('[data-preset-test="text"]')!;
    expect(textEl.getAttribute('title')).toBe('t1');
    expect(textEl.hasAttribute('onerror')).toBe(false);
  });

  it('runtime 导出 Compiler feedback 动作依赖的 message 与 notification', () => {
    expect(Object.isFrozen(testRuntimeMessage)).toBe(true);
    expect(Object.isFrozen(testRuntimeNotification)).toBe(true);
    for (const impl of [testRuntimeMessage, testRuntimeNotification]) {
      for (const level of ['success', 'error', 'warning', 'info']) {
        expect(typeof impl[level as keyof typeof impl]).toBe('function');
      }
    }
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    testRuntimeNotification.success({ message: 'done' });
    expect(info).toHaveBeenCalledWith('[preset-test:notification:success]', { message: 'done' });
    info.mockRestore();
  });
});
