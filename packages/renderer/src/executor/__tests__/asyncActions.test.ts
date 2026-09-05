/**
 * asyncActions 单元测试
 * @module renderer/executor/actions/asyncActions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiCall, delay } from '../actions/asyncActions';
import { DSLExecutor } from '../Engine';
import type { ExecutionContext } from '../../dsl';

describe('asyncActions', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as typeof fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createMockContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
    return DSLExecutor.createContext({
      user: { id: '1', name: 'test', roles: [], permissions: [] },
      route: { path: '/', query: {}, params: {} },
      dispatch: vi.fn(),
      getState: vi.fn(),
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
      ...overrides,
    });
  }

  function createFetchContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
    const context = createMockContext(overrides);
    context.api = undefined as any;
    // M0-4 Scope E：内置 fetch 回退需要显式授予 network 能力
    context.hostCapabilities = { network: true } as never;
    return context;
  }

  describe('apiCall', () => {
    it('writes resultTo into runtime and exposes the updated snapshot', async () => {
      const mockResponse = { id: 1, name: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = createFetchContext();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          resultTo: 'users',
        },
        context,
      );

      expect(context.runtime.get('users')).toEqual(mockResponse);
      expect(context.data.users).toEqual(mockResponse);
    });

    it('writes nested resultTo paths into runtime', async () => {
      const mockResponse = { token: 'abc123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = createFetchContext();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/auth',
          resultTo: 'auth.token',
        },
        context,
      );

      expect(context.runtime.get('auth.token')).toEqual(mockResponse);
      expect(context.data.auth).toEqual({ token: mockResponse });
    });

    it('writes nested State resultTo paths into runtime', async () => {
      const mockResponse = { name: 'Ada' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = createFetchContext();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/profile',
          resultTo: 'state.user.profile',
        },
        context,
      );

      expect(context.runtime.get('state.user.profile')).toEqual(mockResponse);
      expect(context.state.user).toEqual({ profile: mockResponse });
    });

    it('uses runtime.set for resultTo writes', async () => {
      const mockResponse = { id: 1, name: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = createFetchContext();
      const setSpy = vi.spyOn(context.runtime, 'set');

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          resultTo: 'users',
        },
        context,
      );

      expect(setSpy).toHaveBeenCalledWith('users', mockResponse);
    });

    it('executes onSuccess callbacks with response in context', async () => {
      const mockResponse = { id: 1 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const execute = vi.fn();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          onSuccess: [{ type: 'log', value: 'success' } as any],
        },
        createFetchContext(),
        { execute } as any,
      );

      expect(execute).toHaveBeenCalledWith(
        [{ type: 'log', value: 'success' }],
        expect.objectContaining({ response: mockResponse }),
      );
    });

    it('executes onError callbacks with error details in context', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const execute = vi.fn();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          onError: [{ type: 'log', value: 'error' } as any],
        },
        createFetchContext(),
        { execute } as any,
      );

      expect(execute).toHaveBeenCalledWith(
        [{ type: 'log', value: 'error' }],
        expect.objectContaining({
          error: 'Network error',
          errorObject: expect.any(Error),
        }),
      );
    });

    it('shows UI errors only when showError is true', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const context = createFetchContext();

      await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          showError: true,
        },
        context,
      );

      expect(context.ui.message.error).toHaveBeenCalledWith('Network error');
    });

    it('supports context.api.request configuration passthrough', async () => {
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

      const result = await apiCall(
        {
          type: 'apiCall',
          url: 'https://api.example.com/users',
          method: 'POST',
          headers: { Authorization: 'Bearer token' } as any,
          params: { page: 1 } as any,
          body: { name: 'test' } as any,
        },
        context,
      );

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

    it('blocks unsafe URLs and unsafe resultTo paths', async () => {
      await expect(
        apiCall(
          {
            type: 'apiCall',
            url: 'http://localhost:3000/api',
          },
          createFetchContext(),
        ),
      ).rejects.toThrow('blocked unsafe URL');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await expect(
        apiCall(
          {
            type: 'apiCall',
            url: 'https://api.example.com/data',
            resultTo: '__proto__.polluted',
          },
          createFetchContext(),
        ),
      ).rejects.toThrow('unsafe resultTo path');
    });

    it('rejects protocol-relative, backslash, control characters, and unsafe schemes without calling network entries', async () => {
      const unsafeUrls = [
        '//attacker.example.com/path',
        '///attacker.example.com',
        '/api/v1\\evil',
        '/api/v1\u0000test',
        '/api/v1\r\ntest',
        '/api/v1\ttest',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
      ];

      for (const url of unsafeUrls) {
        // Test fetch fallback context
        const fetchContext = createFetchContext();
        mockFetch.mockClear();
        await expect(
          apiCall(
            {
              type: 'apiCall',
              url,
            },
            fetchContext,
          ),
        ).rejects.toThrow('blocked unsafe URL');
        expect(mockFetch).not.toHaveBeenCalled();

        // Test context.api mode
        const mockApiContext = createMockContext();
        await expect(
          apiCall(
            {
              type: 'apiCall',
              url,
            },
            mockApiContext,
          ),
        ).rejects.toThrow('blocked unsafe URL');
        expect(mockApiContext.api.get).not.toHaveBeenCalled();
        expect(mockApiContext.api.request).not.toHaveBeenCalled();
      }
    });

    it('permits valid root-relative URLs and invokes network handlers', async () => {
      const mockResponse = { ok: true, data: 'from-root-relative' };

      // 1. Fetch mode
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      const fetchContext = createFetchContext();
      const fetchResult = await apiCall(
        {
          type: 'apiCall',
          url: '/api/v1/resource',
          resultTo: 'apiData',
        },
        fetchContext,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/resource');
      expect(fetchResult.response).toEqual(mockResponse);
      expect(fetchContext.data.apiData).toEqual(mockResponse);

      // 2. Context.api mode
      const apiContext = createMockContext();
      (apiContext.api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);
      const apiResult = await apiCall(
        {
          type: 'apiCall',
          url: '/api/v1/resource',
          resultTo: 'apiData',
        },
        apiContext,
      );
      expect(apiContext.api.get).toHaveBeenCalledTimes(1);
      expect(apiContext.api.get).toHaveBeenCalledWith('/api/v1/resource', undefined, undefined);
      expect(apiResult.response).toEqual(mockResponse);
      expect(apiContext.data.apiData).toEqual(mockResponse);
    });
  });

  describe('delay', () => {
    const delayContext = DSLExecutor.createContext();

    it('delays the specified time', async () => {
      const delayPromise = delay({ type: 'delay', ms: 1000 }, delayContext);

      await vi.advanceTimersByTimeAsync(1000);
      await expect(delayPromise).resolves.toEqual({ delayed: 1000 });
    });

    it('treats undefined ms as zero', async () => {
      const delayPromise = delay({ type: 'delay' } as any, delayContext);

      await vi.advanceTimersByTimeAsync(0);
      await expect(delayPromise).resolves.toEqual({ delayed: 0 });
    });

    it('rejects negative or NaN delays', async () => {
      await expect(delay({ type: 'delay', ms: -100 }, delayContext)).rejects.toThrow(
        'ms must be a positive number',
      );
      await expect(delay({ type: 'delay', ms: NaN }, delayContext)).rejects.toThrow(
        'ms must be a positive number',
      );
    });
  });
});
