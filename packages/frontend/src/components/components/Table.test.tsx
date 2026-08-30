import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ComponentRuntimeBridgeContext,
  type ComponentRuntimeBridge,
} from '@lowcode-platform/renderer';
import { Table } from './Table';

function createBridge(overrides: Partial<ComponentRuntimeBridge> = {}): ComponentRuntimeBridge {
  return {
    resolveValue: vi.fn((value: unknown, scope?: Record<string, unknown>) => {
      if (typeof value !== 'string') {
        return value;
      }
      // 模板解析桩：{{record.xxx}} / {{value}} 足够覆盖 Table 的两种用法
      const record = scope?.record;
      return value
        .replace(/\{\{record\.(\w+)\}\}/g, (_match, key: string) =>
          record && typeof record === 'object' ? String((record as any)[key] ?? '') : '',
        )
        .replace(/\{\{value\}\}/g, String(scope?.value ?? ''));
    }),
    executeActions: vi.fn(async () => undefined),
    getResource: vi.fn(() => ({ status: 'error' as const, error: 'denied' })),
    ...overrides,
  };
}

let originalMatchMedia: typeof window.matchMedia | undefined;
let originalGetComputedStyle: typeof window.getComputedStyle | undefined;

beforeAll(() => {
  originalMatchMedia = window.matchMedia;
  originalGetComputedStyle = window.getComputedStyle;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  window.getComputedStyle = vi.fn(
    () =>
      ({
        getPropertyValue: () => '',
      }) as unknown as CSSStyleDeclaration,
  );
});

afterAll(() => {
  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  }
  if (originalGetComputedStyle) {
    window.getComputedStyle = originalGetComputedStyle;
  }
});

describe('Table structured columns', () => {
  it('renders legacy data columns as normal data cells (bridge optional)', () => {
    render(
      <Table
        columns={[{ title: '姓名', dataIndex: 'name', key: 'name' }] as any}
        dataSource={[{ key: '1', name: 'Alice' }]}
        pagination={false}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders link columns from template and executes link actions via the runtime bridge', () => {
    const executeActions = vi.fn(async () => undefined);
    const bridge = createBridge({ executeActions });

    render(
      <ComponentRuntimeBridgeContext.Provider value={bridge}>
        <Table
          __componentId="table-1"
          columns={
            [
              {
                kind: 'link',
                title: '详情',
                dataIndex: 'name',
                key: 'detail',
                textMode: 'template',
                textTemplate: '查看 {{record.name}}',
                actions: [{ type: 'navigate', to: '/users/{{record.id}}' }],
              },
            ] as any
          }
          dataSource={[{ key: '1', id: 'u1', name: 'Alice' }]}
          pagination={false}
        />
      </ComponentRuntimeBridgeContext.Provider>,
    );

    const linkButton = screen.getByRole('button', { name: '查看 Alice' });
    expect(bridge.resolveValue).toHaveBeenCalledWith(
      '查看 {{record.name}}',
      expect.objectContaining({ componentId: 'table-1', rowIndex: 0, value: 'Alice' }),
    );
    fireEvent.click(linkButton);

    expect(executeActions).toHaveBeenCalledWith(
      [{ type: 'navigate', to: '/users/{{record.id}}' }],
      expect.any(MouseEvent),
      expect.objectContaining({
        componentId: 'table-1',
        rowIndex: 0,
        value: 'Alice',
        record: expect.objectContaining({ id: 'u1', name: 'Alice' }),
      }),
    );
  });

  it('renders action columns with text buttons and executes per-button actions via the bridge', () => {
    const executeActions = vi.fn(async () => undefined);
    const bridge = createBridge({ executeActions });

    render(
      <ComponentRuntimeBridgeContext.Provider value={bridge}>
        <Table
          __componentId="table-1"
          columns={
            [
              {
                kind: 'action',
                title: '操作',
                key: 'actions',
                buttons: [
                  {
                    label: '编辑',
                    actions: [
                      { type: 'feedback', kind: 'message', content: 'edit', level: 'info' },
                    ],
                  },
                  {
                    label: '删除',
                    buttonType: 'link',
                    danger: true,
                    actions: [
                      { type: 'feedback', kind: 'message', content: 'delete', level: 'warning' },
                    ],
                  },
                ],
              },
            ] as any
          }
          dataSource={[{ key: '1', id: 'u1', name: 'Alice' }]}
          pagination={false}
        />
      </ComponentRuntimeBridgeContext.Provider>,
    );

    const editButton = screen.getByRole('button', { name: '编辑' });
    const deleteButton = screen.getByRole('button', { name: '删除' });
    expect(editButton).not.toBeDisabled();
    expect(deleteButton).not.toBeDisabled();

    fireEvent.click(editButton);
    fireEvent.click(deleteButton);

    expect(executeActions).toHaveBeenNthCalledWith(
      1,
      [{ type: 'feedback', kind: 'message', content: 'edit', level: 'info' }],
      expect.any(MouseEvent),
      expect.objectContaining({
        componentId: 'table-1',
        rowIndex: 0,
        value: undefined,
        record: expect.objectContaining({ id: 'u1' }),
      }),
    );
    expect(executeActions).toHaveBeenNthCalledWith(
      2,
      [{ type: 'feedback', kind: 'message', content: 'delete', level: 'warning' }],
      expect.any(MouseEvent),
      expect.objectContaining({
        componentId: 'table-1',
        rowIndex: 0,
      }),
    );
  });

  it('disables interactive buttons when no bridge is provided (fail-close degradation)', () => {
    render(
      <Table
        columns={
          [
            {
              kind: 'action',
              title: '操作',
              key: 'actions',
              buttons: [
                {
                  label: '编辑',
                  actions: [{ type: 'feedback', kind: 'message', content: 'edit', level: 'info' }],
                },
              ],
            },
          ] as any
        }
        dataSource={[{ key: '1', id: 'u1', name: 'Alice' }]}
        pagination={false}
      />,
    );

    expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
  });
});
