/**
 * Mock执行上下文
 * 用于测试DSL执行
 */

import type { ExecutionContext } from '../../src/types/dsl';

export const createMockContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => {
  return {
    // 组件数据
    data: {
      'button1': { text: '提交', type: 'primary' },
      'input1': 'test value',
      'form1': { name: 'John', age: 30 },
    },

    // 表单数据
    formData: {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      status: 'active',
      amount: 1000,
    },

    // 用户信息
    user: {
      id: 'user123',
      name: 'John Doe',
      roles: ['admin', 'user'],
      permissions: ['read', 'write', 'delete'],
    },

    // 路由信息
    route: {
      path: '/dashboard',
      query: { tab: 'overview' },
      params: { id: '123' },
    },

    // 全局状态
    state: {
      loading: false,
      error: null,
      theme: 'light',
    },

    // Redux dispatch
    dispatch: vi.fn(),

    // 获取Store状态
    getState: vi.fn(() => ({
      components: { data: {} },
    })),

    // 事件对象
    event: null,

    // 工具函数
    utils: {
      formatDate: vi.fn((date: Date | string) => String(date)),
      uuid: vi.fn(() => 'test-uuid-12345'),
      clone: vi.fn(<T>(obj: T): T => JSON.parse(JSON.stringify(obj))),
      debounce: vi.fn(),
      throttle: vi.fn(),
    },

    // UI操作
    ui: {
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
      },
      modal: {
        confirm: vi.fn(() => Promise.resolve(true)),
        info: vi.fn(() => Promise.resolve()),
        success: vi.fn(() => Promise.resolve()),
        error: vi.fn(() => Promise.resolve()),
        warning: vi.fn(() => Promise.resolve()),
      },
      notification: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
      },
    },

    // API客户端
    api: {
      get: vi.fn(() => Promise.resolve({ data: 'test' })),
      post: vi.fn(() => Promise.resolve({ success: true })),
      put: vi.fn(() => Promise.resolve({ success: true })),
      delete: vi.fn(() => Promise.resolve({ success: true })),
      request: vi.fn(() => Promise.resolve({ data: 'test' })),
    },

    // 导航
    navigate: vi.fn(),
    back: vi.fn(),

    // 覆盖
    ...overrides,
  };
};

/**
 * Mock EventDispatcher
 */
export const createMockEventDispatcher = () => {
  return {
    dispatch: vi.fn(),
    setContext: vi.fn(),
    execute: vi.fn(),
    createHandler: vi.fn(),
    updateComponentData: vi.fn(),
    getExecutor: vi.fn(),
    getExecutionContext: vi.fn(),
  };
};

/**
 * Mock DSLExecutor
 */
export const createMockExecutor = () => {
  return {
    execute: vi.fn(),
    executeSingle: vi.fn(),
    registerHandler: vi.fn(),
    registerHandlers: vi.fn(),
    getRegisteredHandlers: vi.fn(() => []),
    hasHandler: vi.fn(() => false),
  };
};

/**
 * Mock Ant Design组件
 */
export const mockAntdMessage = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

export const mockAntdModal = {
  confirm: vi.fn(() => Promise.resolve(true)),
  info: vi.fn(() => Promise.resolve()),
  success: vi.fn(() => Promise.resolve()),
  error: vi.fn(() => Promise.resolve()),
  warning: vi.fn(() => Promise.resolve()),
};
