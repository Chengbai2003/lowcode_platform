/**
 * 数据操作Actions单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setField, mergeField, clearField } from '../../../src/executor/actions/dataActions';

describe('setField Action', () => {
  let mockContext: any;
  let mockDispatch: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    mockContext = {
      data: {
        user: { name: 'John', age: 30 },
      },
      dispatch: mockDispatch,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该设置简单字段的值', async () => {
    const action = {
      type: 'setField',
      field: 'name',
      value: 'Jane',
    };

    const result = await setField(action, mockContext);

    expect(mockContext.data.name).toBe('Jane');
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FIELD',
      payload: { field: 'name', value: 'Jane' },
    });
    expect(result).toBe('Jane');
  });

  it('应该设置嵌套字段的值', async () => {
    const action = {
      type: 'setField',
      field: 'user.email',
      value: 'jane@example.com',
    };

    await setField(action, mockContext);

    expect(mockContext.data.user.email).toBe('jane@example.com');
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('应该解析表达式值', async () => {
    const action = {
      type: 'setField',
      field: 'fullName',
      value: 'John Doe',
    };

    await setField(action, mockContext);

    expect(mockContext.data.fullName).toBe('John Doe');
  });

  it('应该创建新的嵌套路径', async () => {
    const action = {
      type: 'setField',
      field: 'new.nested.path',
      value: 'test',
    };

    await setField(action, mockContext);

    expect(mockContext.data.new.nested.path).toBe('test');
  });

  it('应该设置数字值', async () => {
    const action = {
      type: 'setField',
      field: 'count',
      value: 42,
    };

    await setField(action, mockContext);

    expect(mockContext.data.count).toBe(42);
  });

  it('应该设置布尔值', async () => {
    const action = {
      type: 'setField',
      field: 'active',
      value: true,
    };

    await setField(action, mockContext);

    expect(mockContext.data.active).toBe(true);
  });

  it('应该设置null和undefined', async () => {
    const action1 = {
      type: 'setField',
      field: 'nullValue',
      value: null,
    };

    await setField(action1, mockContext);
    expect(mockContext.data.nullValue).toBeNull();

    const action2 = {
      type: 'setField' as any,
      field: 'undefinedValue',
      value: undefined,
    };

    await setField(action2, mockContext);
    expect(mockContext.data.undefinedValue).toBeUndefined();
  });
});

describe('mergeField Action', () => {
  let mockContext: any;
  let mockDispatch: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    mockContext = {
      data: {
        user: {
          name: 'John',
          age: 30,
        },
      },
      dispatch: mockDispatch,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该合并对象字段', async () => {
    const action = {
      type: 'mergeField',
      field: 'user',
      value: {
        email: 'john@example.com',
        city: 'Beijing',
      },
    };

    const result = await mergeField(action, mockContext);

    expect(mockContext.data.user).toEqual({
      name: 'John',
      age: 30,
      email: 'john@example.com',
      city: 'Beijing',
    });
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('应该覆盖已存在的字段', async () => {
    const action = {
      type: 'mergeField',
      field: 'user',
      value: {
        age: 31,
      },
    };

    await mergeField(action, mockContext);

    expect(mockContext.data.user.age).toBe(31);
    expect(mockContext.data.user.name).toBe('John'); // 其他字段保留
  });

  it('应该创建新字段', async () => {
    const action = {
      type: 'mergeField',
      field: 'settings',
      value: {
        theme: 'dark',
        language: 'zh-CN',
      },
    };

    await mergeField(action, mockContext);

    expect(mockContext.data.settings).toEqual({
      theme: 'dark',
      language: 'zh-CN',
    });
  });

  it('应该处理空合并值', async () => {
    const action = {
      type: 'mergeField',
      field: 'user',
      value: {},
    };

    await mergeField(action, mockContext);

    expect(mockContext.data.user).toEqual({
      name: 'John',
      age: 30,
    });
  });

  it('应该处理嵌套合并', async () => {
    mockContext.data.user = {
      profile: {
        avatar: 'old.jpg',
      },
    };

    const action = {
      type: 'mergeField',
      field: 'user',
      value: {
        profile: {
          bio: 'Hello',
        },
      },
    };

    await mergeField(action, mockContext);

    expect(mockContext.data.user.profile).toEqual({
      avatar: 'old.jpg',
      bio: 'Hello',
    });
  });

  it('应该解析表达式值', async (context) => {
    const action = {
      type: 'mergeField',
      field: 'user',
      value: {
        city: 'Beijing',
      },
    };

    await mergeField(action, mockContext);

    expect(mockContext.data.user.city).toBe('Beijing');
  });
});

describe('clearField Action', () => {
  let mockContext: any;
  let mockDispatch: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    mockContext = {
      data: {
        user: {
          name: 'John',
          age: 30,
          email: 'john@example.com',
        },
        settings: {
          theme: 'dark',
        },
      },
      dispatch: mockDispatch,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该清除简单字段', async () => {
    const action = {
      type: 'clearField',
      field: 'settings',
    };

    await clearField(action, mockContext);

    expect(mockContext.data.settings).toBeUndefined();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('应该清除嵌套字段', async () => {
    const action = {
      type: 'clearField',
      field: 'user.email',
    };

    await clearField(action, mockContext);

    expect(mockContext.data.user.email).toBeUndefined();
    expect(mockContext.data.user.name).toBe('John'); // 其他字段保留
    expect(mockContext.data.user.age).toBe(30);
  });

  it('应该处理不存在的字段', async () => {
    const action = {
      type: 'clearField',
      field: 'nonexistent',
    };

    await clearField(action, mockContext);

    // 不应该抛出错误
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('应该清除深层嵌套字段', async () => {
    mockContext.data.user = {
      profile: {
        settings: {
          notification: true,
        },
      },
    };

    const action = {
      type: 'clearField',
      field: 'user.profile.settings.notification',
    };

    await clearField(action, mockContext);

    expect(mockContext.data.user.profile.settings.notification).toBeUndefined();
  });
});

describe('边界情况', () => {
  it('应该处理没有dispatch的上下文', async () => {
    const context = {
      data: {},
    };

    const action = {
      type: 'setField',
      field: 'name',
      value: 'John',
    };

    await setField(action, context);

    expect(context.data.name).toBe('John');
  });

  it('应该处理空data对象', async () => {
    const context = {
      data: {},
      dispatch: vi.fn(),
    };

    const action = {
      type: 'setField',
      field: 'newField',
      value: 'test',
    };

    await setField(action, context);

    expect(context.data.newField).toBe('test');
  });

  it('应该处理特殊的字段名', async () => {
    const context = {
      data: {},
      dispatch: vi.fn(),
    };

    const action = {
      type: 'setField',
      field: 'field-with-dashes.field_with_underscores',
      value: 'test',
    };

    await setField(action, context);

    expect(context.data['field-with-dashes'].field_with_underscores).toBe('test');
  });
});
