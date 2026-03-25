/**
 * asyncActions 单元测试
 * @module renderer/executor/actions/asyncActions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiCall, delay } from '../actions/asyncActions';
import { DSLExecutor } from '../Engine';
import type { ExecutionContext } from '../../../types';

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
