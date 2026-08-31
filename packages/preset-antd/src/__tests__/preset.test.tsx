import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
  ComponentRuntimeBridgeContext,
  Renderer,
  type ComponentRuntimeBridge,
} from '@lowcode-platform/renderer';
import { createAntdPreset, antdPreset } from '../createAntdPreset';
import { antdRuntime, Table } from '../runtime';
import { antdCompilerBindings } from '../compiler';
import { isUnsafeResourceUrl } from '../validation';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const schemaWithDiv = (props: Record<string, unknown>) => ({
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['d1'] },
    d1: { id: 'd1', type: 'Div', props },
  },
});

describe('antdPreset seal 语义（Bootstrap 后不可变）', () => {
  it('整棵 Registry 结构深冻结，且每个 runtime 组件都有 Manifest 条目', () => {
    expect(Object.isFrozen(antdPreset)).toBe(true);
    expect(Object.isFrozen(antdPreset.runtime)).toBe(true);
    expect(Object.isFrozen(antdPreset.manifest)).toBe(true);
    expect(Object.isFrozen(antdPreset.compiler)).toBe(true);
    expect(Object.isFrozen(antdPreset.compiler.componentSources)).toBe(true);

    for (const type of Object.keys(antdPreset.runtime)) {
      const entry = antdPreset.manifest[type];
      expect(entry, `manifest entry for ${type}`).toBeDefined();
      expect(Object.isFrozen(entry!.allowedProps)).toBe(true);
    }
  });

  it('createAntdPreset 返回新的 frozen 实例（内容共享）', () => {
    const fresh = createAntdPreset();
    expect(fresh).not.toBe(antdPreset);
    // Registry 对象是各自的冻结副本（seal 不改写入参），组件实现共享
    expect(fresh.runtime).not.toBe(antdPreset.runtime);
    expect(fresh.runtime.Page).toBe(antdPreset.runtime.Page);
    expect(Object.isFrozen(fresh)).toBe(true);
    expect(() => {
      (fresh as { id: string }).id = 'tampered';
    }).toThrow();
  });

  it('runtime 不包含 antd 之外的组件库实现，且数量与 manifest 一致', () => {
    expect(Object.keys(antdRuntime).sort()).toEqual(Object.keys(antdPreset.manifest).sort());
  });

  it('compiler 绑定覆盖全部 runtime 组件并指向 /runtime 子路径', () => {
    for (const type of Object.keys(antdRuntime)) {
      expect(antdCompilerBindings.componentSources[type]).toBe(
        '@lowcode-platform/preset-antd/runtime',
      );
      expect(antdCompilerBindings.componentBindings?.[type]).toEqual({
        module: '@lowcode-platform/preset-antd/runtime',
      });
    }
    expect(antdCompilerBindings.defaultLibrary).toBe('antd');
  });
});

describe('antdPreset Props 净化（fail-close，经 Renderer 端到端）', () => {
  it('白名单外 Props 与危险 DOM Props 不进入组件', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <Renderer
        preset={antdPreset}
        pageId="p-antd-test"
        documentSessionId="doc-1"
        schema={
          schemaWithDiv({
            className: 'kept',
            'data-unknown': 'x',
            dangerouslySetInnerHTML: { __html: '<b>poison</b>' },
          }) as never
        }
      />,
    );
    expect(container.querySelector('.kept')).not.toBeNull();
    expect(container.querySelector('[data-unknown]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    warn.mockRestore();
  });

  it('Link 的危险 URL scheme 被移除，正常 https 保留', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['l1'],
        },
        l1: {
          id: 'l1',
          type: 'Link',
          props: { href: 'javascript:alert(1)', target: '_blank' },
          childrenIds: [],
        },
      },
    };
    const { container } = render(
      <Renderer
        preset={antdPreset}
        pageId="p-antd-test"
        documentSessionId="doc-1"
        schema={schema as never}
      />,
    );

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBeNull();
    expect(link!.getAttribute('target')).toBe('_blank');
    warn.mockRestore();
  });

  it('Avatar 的危险 src 被移除', () => {
    const { container } = render(
      <Renderer
        preset={antdPreset}
        pageId="p-avatar-test"
        documentSessionId="doc-1"
        schema={
          {
            schemaVersion: 0,
            rootId: 'root',
            components: {
              root: { id: 'root', type: 'Page', childrenIds: ['avatar'] },
              avatar: { id: 'avatar', type: 'Avatar', props: { src: 'javascript:alert(1)' } },
            },
          } as never
        }
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src') ?? null).toBeNull();
  });

  it('isUnsafeResourceUrl 判定危险 scheme', () => {
    expect(isUnsafeResourceUrl('javascript:alert(1)')).toBe(true);
    expect(isUnsafeResourceUrl('data:text/html,<b>x</b>')).toBe(true);
    expect(isUnsafeResourceUrl('data:image/png;base64,xxx')).toBe(false);
    expect(isUnsafeResourceUrl('https://example.com/a.png')).toBe(false);
    expect(isUnsafeResourceUrl('/relative/path.png')).toBe(false);
    expect(isUnsafeResourceUrl(42)).toBe(false);
  });
});

describe('antdPreset Table runtime bridge', () => {
  it('结构化 link/action 列通过桥执行 actions', () => {
    const bridge: ComponentRuntimeBridge = {
      resolveValue: vi.fn(() => '查看 Alice'),
      executeActions: vi.fn(async () => undefined),
      getResource: vi.fn(() => ({ status: 'error', error: 'denied' })),
    };
    render(
      <ComponentRuntimeBridgeContext.Provider value={bridge}>
        <Table
          __componentId="table-1"
          pagination={false}
          dataSource={[{ key: '1', id: 'u1', name: 'Alice' }]}
          columns={[
            {
              kind: 'link',
              title: '详情',
              dataIndex: 'name',
              textMode: 'template',
              textTemplate: '查看 {{record.name}}',
              actions: [{ type: 'navigate', to: '/users/u1' }],
            },
            {
              kind: 'action',
              title: '操作',
              buttons: [
                {
                  label: '编辑',
                  actions: [{ type: 'feedback', kind: 'message', content: 'edit' }],
                },
              ],
            },
          ]}
        />
      </ComponentRuntimeBridgeContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看 Alice' }));
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(bridge.executeActions).toHaveBeenCalledTimes(2);
    expect(bridge.executeActions).toHaveBeenCalledWith(
      [{ type: 'navigate', to: '/users/u1' }],
      expect.any(MouseEvent),
      expect.objectContaining({ componentId: 'table-1', rowIndex: 0 }),
    );
  });
});
