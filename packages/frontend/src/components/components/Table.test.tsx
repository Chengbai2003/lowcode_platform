import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../types';
import { Table } from './Table';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    data: {},
    formData: {},
    user: { id: 'u1', name: 'Tester', roles: [], permissions: [] },
    route: { path: '/', query: {}, params: {} },
    state: {},
    dispatch: vi.fn(),
    getState: vi.fn(),
    utils: {
      formatDate: vi.fn((value) => String(value)),
      uuid: vi.fn(() => 'uuid'),
      clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
      debounce: vi.fn((fn) => fn),
      throttle: vi.fn((fn) => fn),
    },
    ui: {
      message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
      modal: {
        confirm: vi.fn(async () => false),
        info: vi.fn(async () => undefined),
        success: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
        warning: vi.fn(async () => undefined),
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
      }) as CSSStyleDeclaration,
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
  it('renders legacy data columns as normal data cells', () => {
    render(
      <Table
        columns={[{ title: '姓名', dataIndex: 'name', key: 'name' }] as any}
        dataSource={[{ key: '1', name: 'Alice' }]}
        pagination={false}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders link columns from template and executes link actions with row context', () => {
    const execute = vi.fn(async () => undefined);
    const getExecutionContext = vi.fn(() =>
      createExecutionContext({
        data: { currentUser: 'tester' },
      }),
    );
    const dispatcher = {
      execute,
      getExecutionContext,
    } as any;

    render(
      <Table
        __eventDispatcher={dispatcher}
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
      />,
    );

    const linkButton = screen.getByRole('button', { name: '查看 Alice' });
    fireEvent.click(linkButton);

    expect(execute).toHaveBeenCalledWith(
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

  it('renders action columns with text buttons and executes per-button actions', () => {
    const execute = vi.fn(async () => undefined);
    const dispatcher = {
      execute,
      getExecutionContext: vi.fn(() => createExecutionContext()),
    } as any;

    render(
      <Table
        __eventDispatcher={dispatcher}
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
                  actions: [{ type: 'feedback', kind: 'message', content: 'edit', level: 'info' }],
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
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(execute).toHaveBeenNthCalledWith(
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
    expect(execute).toHaveBeenNthCalledWith(
      2,
      [{ type: 'feedback', kind: 'message', content: 'delete', level: 'warning' }],
      expect.any(MouseEvent),
      expect.objectContaining({
        componentId: 'table-1',
        rowIndex: 0,
      }),
    );
  });
});
