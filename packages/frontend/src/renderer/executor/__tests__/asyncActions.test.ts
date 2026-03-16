/**
 * asyncActions 单元测试
 * @module renderer/executor/actions/asyncActions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCall, delay } from '../actions/asyncActions';
import type { ExecutionContext } from '../../../../types/dsl/context';
import type { Action } from '../../../../types/dsl/action-union';
import { ReactiveRuntime } from '../../reactive/runtime';

describe('asyncActions', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('apiCall', () => {
    const createMockContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => {
      const data: Record<string, unknown> = {};
      return {
        data,
        formData: {},
        user: { id: '1', name: 'test', roles: [], permissions: [] },
        route: { path: '/', query: {}, params: {} },
        state: {},
        dispatch: vi.fn(),
        getState: vi.fn(),
        utils: {
          formatDate: vi.fn(),
          uuid: vi.fn(),
          clone: vi.fn(),
          debounce: vi.fn(),
          throttle: vi.fn(),
        },
        ui: {
          message: {
            success: vi.fn(),
            error: vi.fn(),
            warning: vi.fn(),
            info: vi.fn(),
          },
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
        ...overrides,
      } as ExecutionContext;
    };

    describe('结果写入到 resultTo 路径', () => {
      it('应将 API 响应写入到 data 路径（legacy）', async () => {
        const mockResponse = { id: 1, name: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          resultTo: 'users',
        };

        await apiCall(action, context);

        expect(context.data.users).toEqual(mockResponse);
      });

      it('应将 API 响应写入到深层路径（legacy）', async () => {
        const mockResponse = { token: 'abc123' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/auth',
          resultTo: 'auth.token',
        };

        await apiCall(action, context);

        expect(context.data.auth).toEqual({ token: mockResponse });
      });

      it('应调用 markFullChange（legacy）', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const markFullChange = vi.fn();
        const context = createMockContext({ markFullChange, api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
          resultTo: 'result',
        };

        await apiCall(action, context);

        expect(markFullChange).toHaveBeenCalled();
      });
    });

    describe('runtime 路径', () => {
      it('当 context.runtime 存在时应使用 runtime.set()', async () => {
        const mockResponse = { id: 1, name: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const runtime = new ReactiveRuntime();
        const setSpy = vi.spyOn(runtime, 'set');

        const context = createMockContext({ runtime, api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          resultTo: 'users',
        };

        await apiCall(action, context);

        expect(setSpy).toHaveBeenCalledWith('users', mockResponse);
        expect(runtime.get('users')).toEqual(mockResponse);
      });

      it('使用 runtime 时不调用 markFullChange', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const runtime = new ReactiveRuntime();
        const markFullChange = vi.fn();
        const context = createMockContext({ runtime, markFullChange, api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
          resultTo: 'result',
        };

        await apiCall(action, context);

        // runtime 模式下不调用 markFullChange
        expect(markFullChange).not.toHaveBeenCalled();
      });
    });

    describe('onSuccess 回调', () => {
      it('应执行 onSuccess 回调', async () => {
        const mockResponse = { id: 1 };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const onSuccessHandler = vi.fn();
        const mockExecutor = {
          execute: onSuccessHandler,
        };

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          onSuccess: [{ type: 'log' as const, message: 'success' }],
        };

        await apiCall(action, context, mockExecutor);

        expect(onSuccessHandler).toHaveBeenCalled();
        const callArgs = onSuccessHandler.mock.calls[0];
        expect(callArgs[0]).toEqual(action.onSuccess);
        expect(callArgs[1].response).toEqual(mockResponse);
      });
    });

    describe('onError 错误处理', () => {
      it('应执行 onError 回调', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const onErrorHandler = vi.fn();
        const mockExecutor = {
          execute: onErrorHandler,
        };

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          onError: [{ type: 'log' as const, message: 'error' }],
        };

        await apiCall(action, context, mockExecutor);

        expect(onErrorHandler).toHaveBeenCalled();
        const callArgs = onErrorHandler.mock.calls[0];
        expect(callArgs[0]).toEqual(action.onError);
        expect(callArgs[1].error).toBe('Network error');
        expect(callArgs[1].errorObject).toBeInstanceOf(Error);
      });

      it('应显示错误消息（showError: true）', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          showError: true,
        };

        await apiCall(action, context);

        expect(context.ui.message.error).toHaveBeenCalledWith('Network error');
      });

      it('不应显示错误消息（showError: false）', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          showError: false,
        };

        await apiCall(action, context);

        expect(context.ui.message.error).not.toHaveBeenCalled();
      });

      it('HTTP 错误响应应触发错误处理', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found'),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/notfound',
        };

        const result = await apiCall(action, context);

        expect(result).toEqual({ success: false, error: 'HTTP 404: Not Found' });
      });
    });

    describe('SSRF 防护', () => {
      it('应阻止 localhost', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://localhost:3000/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止 127.0.0.1', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://127.0.0.1/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止 10.x.x.x 内网地址', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://10.0.0.1/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止 172.16-31.x.x 内网地址', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://172.16.0.1/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止 192.168.x.x 内网地址', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://192.168.1.1/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止 0.0.0.0', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://0.0.0.0/api',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止危险协议（javascript:）', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'javascript:alert(1)',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应阻止危险协议（file:）', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'file:///etc/passwd',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });

      it('应允许 https 公网地址', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
        };

        const result = await apiCall(action, context);

        expect(result).toEqual({
          success: true,
          response: mockResponse,
          resultTo: undefined,
        });
      });

      it('应允许 http 公网地址', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'http://api.example.com/data',
        };

        const result = await apiCall(action, context);

        expect(result).toEqual({
          success: true,
          response: mockResponse,
          resultTo: undefined,
        });
      });

      it('应阻止无效 URL', async () => {
        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'not-a-valid-url',
        };

        await expect(apiCall(action, context)).rejects.toThrow('blocked unsafe URL');
      });
    });

    describe('请求配置', () => {
      it('应将完整 ApiRequestConfig 传给 context.api.request', async () => {
        const mockResponse = { success: true };
        const request = vi.fn().mockResolvedValueOnce(mockResponse);
        const context = createMockContext({
          api: {
            get: undefined,
            post: undefined,
            put: undefined,
            delete: undefined,
            request,
          } as any,
        });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          method: 'POST' as const,
          headers: { Authorization: 'Bearer token' },
          params: { page: 1 },
          body: { name: 'test' },
        };

        const result = await apiCall(action, context);

        expect(request).toHaveBeenCalledWith({
          url: 'https://api.example.com/users',
          method: 'POST',
          headers: { Authorization: 'Bearer token' },
          params: { page: 1 },
          data: { name: 'test' },
        });
        expect(result).toEqual({
          success: true,
          response: mockResponse,
          resultTo: undefined,
        });
      });

      it('应正确设置请求方法', async () => {
        const mockResponse = { success: true };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          method: 'POST' as const,
        };

        await apiCall(action, context);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({ method: 'POST' }),
        );
      });

      it('应正确设置请求体', async () => {
        const mockResponse = { success: true };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          method: 'POST' as const,
          body: { name: 'test' },
        };

        await apiCall(action, context);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'test' }),
          }),
        );
      });

      it('应正确设置请求头', async () => {
        const mockResponse = { success: true };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          headers: { 'X-Custom-Header': 'test' },
        };

        await apiCall(action, context);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'X-Custom-Header': 'test',
            }),
          }),
        );
      });

      it('应正确添加查询参数', async () => {
        const mockResponse = { success: true };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/users',
          params: { page: 1, limit: 10 },
        };

        await apiCall(action, context);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users?page=1&limit=10',
          expect.any(Object),
        );
      });
    });

    describe('原型污染防护', () => {
      it('应阻止 __proto__ 路径', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
          resultTo: '__proto__.polluted',
        };

        await expect(apiCall(action, context)).rejects.toThrow('unsafe resultTo path');
      });

      it('应阻止 constructor 路径', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
          resultTo: 'constructor.polluted',
        };

        await expect(apiCall(action, context)).rejects.toThrow('unsafe resultTo path');
      });

      it('应阻止 prototype 路径', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const context = createMockContext({ api: undefined });
        const action = {
          type: 'apiCall' as const,
          url: 'https://api.example.com/data',
          resultTo: 'prototype.polluted',
        };

        await expect(apiCall(action, context)).rejects.toThrow('unsafe resultTo path');
      });
    });
  });

  describe('delay', () => {
    it('应延迟指定时间', async () => {
      const delayPromise = delay({ type: 'delay', ms: 1000 }, {} as ExecutionContext);

      // 推进时间
      await vi.advanceTimersByTimeAsync(1000);
      const result = await delayPromise;
      expect(result).toEqual({ delayed: 1000 });
    });

    it('应正确等待延迟完成', async () => {
      // 验证延迟确实在等待指定时间
      let resolved = false;
      const delayPromise = delay({ type: 'delay', ms: 500 }, {} as ExecutionContext);
      delayPromise.then(() => {
        resolved = true;
      });

      // 时间未推进完成
      await vi.advanceTimersByTimeAsync(250);
      expect(resolved).toBe(false);

      // 推进剩余时间
      await vi.advanceTimersByTimeAsync(250);
      await delayPromise;
      expect(resolved).toBe(true);
    });

    it('应处理 ms 为 0', async () => {
      const delayPromise = delay({ type: 'delay', ms: 0 }, {} as ExecutionContext);
      // 即使是 0ms，使用 fake timers 也需要推进时间
      await vi.advanceTimersByTimeAsync(0);
      const result = await delayPromise;
      expect(result).toEqual({ delayed: 0 });
    });

    it('应处理 ms 未定义（默认为 0）', async () => {
      const delayPromise = delay({ type: 'delay' }, {} as ExecutionContext);
      await vi.advanceTimersByTimeAsync(0);
      const result = await delayPromise;
      expect(result).toEqual({ delayed: 0 });
    });

    it('应对负数抛出错误', async () => {
      await expect(delay({ type: 'delay', ms: -100 }, {} as ExecutionContext)).rejects.toThrow(
        'ms must be a positive number',
      );
    });

    it('应对 NaN 抛出错误', async () => {
      await expect(delay({ type: 'delay', ms: NaN }, {} as ExecutionContext)).rejects.toThrow(
        'ms must be a positive number',
      );
    });
  });
});
