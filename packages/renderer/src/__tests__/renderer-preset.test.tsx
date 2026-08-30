import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Renderer } from '../Renderer';
import { sanitizePropsByManifest } from '../preset/sanitizePropsByManifest';
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
    const { container } = render(<Renderer preset={testPreset} schema={schema as never} />);
    expect(container.querySelector('[data-unknown-component="NotRegistered"]')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NotRegistered'));
    warn.mockRestore();
  });

  it('Manifest 在渲染前拒绝未知 Props 与危险 DOM Props（fail-close）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={testPreset}
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

  it('宿主组件覆盖 Preset 类型后不再受 Preset Manifest 约束', () => {
    const received: Record<string, unknown> = {};
    const HostDiv = (props: Record<string, unknown>) => {
      Object.assign(received, props);
      return <div data-host="1" />;
    };
    const { container } = render(
      <Renderer
        preset={testPreset}
        components={{ Div: HostDiv as never }}
        schema={divSchema({ 'data-not-in-manifest': 'x' }) as never}
      />,
    );
    expect(container.querySelector('[data-host="1"]')).not.toBeNull();
    expect(received['data-not-in-manifest']).toBe('x');
  });

  it('未绑定 Preset 且无宿主组件时同样 fail-close（无内置兜底）', () => {
    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Renderer schema={schema as never} />);
    expect(container.querySelector('[data-unknown-component="Page"]')).not.toBeNull();
    warn.mockRestore();
  });
});
