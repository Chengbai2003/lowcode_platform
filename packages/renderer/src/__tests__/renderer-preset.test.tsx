import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Renderer } from '../Renderer';
import { sanitizePropsByManifest } from '../preset/sanitizePropsByManifest';
import { createComponentPreset } from '../preset/createComponentPreset';
import { testPreset } from './fixtures/testPreset';

const divSchema = (props: Record<string, unknown>) => ({
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['d1'] },
    d1: { id: 'd1', type: 'Div', props },
  },
});

describe('Renderer preset contract (M0-4 Scope B)', () => {
  it('未知组件类型 fail-close：拒绝渲染并给出占位标记', () => {
    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: { root: { id: 'root', type: 'NotRegistered', childrenIds: [] } },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-unknown"
        documentSessionId="doc-1"
        schema={schema as never}
      />,
    );
    expect(container.querySelector('[data-unknown-component="NotRegistered"]')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NotRegistered'));
    warn.mockRestore();
  });

  it('Manifest 在渲染前拒绝未知 Props 与危险 DOM Props（fail-close）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={testPreset}
        pageId="p-manifest"
        documentSessionId="doc-1"
        schema={
          divSchema({
            className: 'kept',
            'data-should-vanish': 'x',
            dangerouslySetInnerHTML: { __html: '<b>poison</b>' },
          }) as never
        }
      />,
    );
    expect(container.querySelector('.kept')).not.toBeNull();
    expect(container.querySelector('[data-should-vanish]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected props'));
    warn.mockRestore();
  });

  it('函数型 Props 被 Manifest 净化移除（纵深防御，Contract 边界已先行拒绝）', () => {
    const { props, rejected } = sanitizePropsByManifest(
      'Div',
      { className: 'ok', onClickFn: () => undefined } as Record<string, unknown>,
      testPreset,
    );
    expect(rejected).toEqual(['onClickFn']);
    expect(props.className).toBe('ok');
  });

  it('宿主扩展组件经 createComponentPreset 封闭组合并受其 Manifest 约束', () => {
    const received: Record<string, unknown> = {};
    const CustomWidget = (props: Record<string, unknown>) => {
      Object.assign(received, props);
      return <div data-custom-widget="1" className={props.className as string} />;
    };
    const composedPreset = createComponentPreset({
      base: testPreset,
      extensions: [
        {
          type: 'CustomWidget',
          component: CustomWidget as never,
          manifest: {
            componentType: 'CustomWidget',
            allowedProps: ['className', 'title'],
          },
          compilerBinding: { module: '@example/custom-widget' },
        },
      ],
    });

    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['w1'] },
        w1: {
          id: 'w1',
          type: 'CustomWidget',
          props: { className: 'custom-class', 'data-unknown': 'bad' },
        },
      },
    };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={composedPreset}
        pageId="p-composed"
        documentSessionId="doc-1"
        schema={schema as never}
      />,
    );
    expect(container.querySelector('[data-custom-widget="1"]')).not.toBeNull();
    expect(received.className).toBe('custom-class');
    expect(received['data-unknown']).toBeUndefined(); // Manifest fail-close 过滤
    warn.mockRestore();
  });

  it('拒绝缺少 Compiler binding 的宿主扩展', () => {
    expect(() =>
      createComponentPreset({
        base: testPreset,
        extensions: [
          {
            type: 'NoCompilerBinding',
            component: () => null,
            manifest: { componentType: 'NoCompilerBinding', allowedProps: ['children'] },
          } as never,
        ],
      }),
    ).toThrow(/compilerBinding/);
  });

  it('未提供 Preset 或 pageId / documentSessionId 时 fail-close 抛错', () => {
    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
    };
    expect(() => render((<Renderer schema={schema as never} />) as never)).toThrow(/preset/);
    expect(() =>
      render(
        <Renderer
          preset={testPreset}
          pageId=""
          documentSessionId="doc-1"
          schema={schema as never}
        />,
      ),
    ).toThrow(/pageId/);
    expect(() =>
      render(
        <Renderer preset={testPreset} pageId="p1" documentSessionId="" schema={schema as never} />,
      ),
    ).toThrow(/documentSessionId/);
  });
});
