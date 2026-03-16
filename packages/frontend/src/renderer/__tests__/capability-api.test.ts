import { describe, it, expect, vi } from 'vitest';
import { createCapabilityAPI } from '../executor/capability/capabilityAPI';
import type { ReactiveRuntime } from '../reactive';

describe('CapabilityAPI', () => {
  function createTestAPI(data: Record<string, any> = {}) {
    const setComponentData = vi.fn();
    const markFullChange = vi.fn();
    const validIds = new Set(Object.keys(data));

    const api = createCapabilityAPI({
      validComponentIds: validIds,
      getData: () => data,
      setComponentData,
      markFullChange,
    });

    return { api, setComponentData, markFullChange };
  }

  /**
   * 创建带 mock runtime 的测试 API
   */
  function createTestAPIWithRuntime(data: Record<string, any> = {}) {
    const setComponentData = vi.fn();
    const markFullChange = vi.fn();
    const validIds = new Set(Object.keys(data));

    // 创建 mock ReactiveRuntime
    const runtime = {
      get: vi.fn((id: string) => data[id]),
      set: vi.fn(),
      patch: vi.fn(),
    } as unknown as ReactiveRuntime;

    const api = createCapabilityAPI({
      validComponentIds: validIds,
      runtime,
      getData: () => data,
      setComponentData,
      markFullChange,
    });

    return { api, runtime, setComponentData, markFullChange };
  }

  it('get returns component value', () => {
    const { api } = createTestAPI({ input1: 'hello', input2: 42 });
    expect(api.get('input1')).toBe('hello');
    expect(api.get('input2')).toBe(42);
  });

  it('get warns for unknown componentId but returns undefined', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = createTestAPI({ input1: '' });
    const result = api.get('nonexistent');
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown componentId "nonexistent"'),
    );
    warnSpy.mockRestore();
  });

  it('set calls setComponentData and markFullChange', () => {
    const { api, setComponentData, markFullChange } = createTestAPI({ input1: '' });
    api.set('input1', 'new value');
    expect(setComponentData).toHaveBeenCalledWith('input1', 'new value');
    expect(markFullChange).toHaveBeenCalledTimes(1);
  });

  it('set throws for unknown componentId and does not write', () => {
    const { api, setComponentData, markFullChange } = createTestAPI({ input1: '' });

    expect(() => api.set('unknownId', 'value')).toThrow('Unknown componentId "unknownId"');
    expect(setComponentData).not.toHaveBeenCalled();
    expect(markFullChange).not.toHaveBeenCalled();
  });

  it('patch updates multiple components', () => {
    const { api, setComponentData, markFullChange } = createTestAPI({
      input1: '',
      input2: '',
    });
    api.patch({ input1: 'a', input2: 'b' });
    expect(setComponentData).toHaveBeenCalledWith('input1', 'a');
    expect(setComponentData).toHaveBeenCalledWith('input2', 'b');
    expect(markFullChange).toHaveBeenCalledTimes(1);
  });

  it('patch throws for non-object argument', () => {
    const { api } = createTestAPI();
    expect(() => api.patch(null as any)).toThrow('patch expects a plain object');
  });

  it('patch throws for unknown componentIds and does not write', () => {
    const { api, setComponentData, markFullChange } = createTestAPI({
      input1: '',
    });

    expect(() => api.patch({ input1: 'a', unknownId: 'b' })).toThrow(
      'Unknown componentId "unknownId"',
    );
    expect(setComponentData).not.toHaveBeenCalled();
    expect(markFullChange).not.toHaveBeenCalled();
  });

  it('patch throws for array input', () => {
    const { api } = createTestAPI({ input1: '' });
    expect(() => api.patch(['input1'] as any)).toThrow('patch expects a plain object');
  });

  it('set throws for forbidden componentId', () => {
    const { api } = createTestAPI({ input1: '' });
    expect(() => api.set('__proto__', 'value')).toThrow('Forbidden componentId');
  });

  it('patch throws for forbidden componentId', () => {
    const { api } = createTestAPI({ input1: '' });
    expect(() => api.patch({ constructor: 'boom' } as any)).toThrow('Forbidden componentId');
  });

  it('log outputs to console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { api } = createTestAPI();
    api.log('test message', 123);
    expect(logSpy).toHaveBeenCalledWith('[Sandbox Log]:', 'test message', 123);
    logSpy.mockRestore();
  });

  it('set throws for invalid componentId', () => {
    const { api } = createTestAPI();
    expect(() => api.set('', 'value')).toThrow('Invalid componentId');
  });

  // ============ Runtime 路径测试 ============

  describe('runtime path', () => {
    it('get uses runtime.get when runtime exists', () => {
      const { api, runtime } = createTestAPIWithRuntime({ input1: 'hello' });
      const result = api.get('input1');

      expect(runtime.get).toHaveBeenCalledWith('input1');
      expect(result).toBe('hello');
    });

    it('set uses runtime.set when runtime exists, not setComponentData', () => {
      const { api, runtime, setComponentData, markFullChange } = createTestAPIWithRuntime({
        input1: '',
      });

      api.set('input1', 'new value');

      // 验证 runtime.set 被调用
      expect(runtime.set).toHaveBeenCalledWith('input1', 'new value');
      // 验证遗留路径未被调用
      expect(setComponentData).not.toHaveBeenCalled();
      expect(markFullChange).not.toHaveBeenCalled();
    });

    it('runtime path still rejects unknown componentId writes', () => {
      const { api, runtime } = createTestAPIWithRuntime({ input1: '' });

      expect(() => api.set('unknownId', 'value')).toThrow('Unknown componentId "unknownId"');
      expect(runtime.set).not.toHaveBeenCalled();
    });

    it('patch uses runtime.patch when runtime exists, not multiple setComponentData', () => {
      const { api, runtime, setComponentData, markFullChange } = createTestAPIWithRuntime({
        input1: '',
        input2: '',
      });

      api.patch({ input1: 'a', input2: 'b' });

      // 验证 runtime.patch 被调用
      expect(runtime.patch).toHaveBeenCalledWith({ input1: 'a', input2: 'b' });
      // 验证遗留路径未被调用
      expect(setComponentData).not.toHaveBeenCalled();
      expect(markFullChange).not.toHaveBeenCalled();
    });

    it('runtime path does not call markFullChange for set', () => {
      const { api, markFullChange } = createTestAPIWithRuntime({ input1: '' });

      api.set('input1', 'value');

      // runtime 路径不应触发全量失效
      expect(markFullChange).not.toHaveBeenCalled();
    });

    it('runtime path does not call markFullChange for patch', () => {
      const { api, markFullChange } = createTestAPIWithRuntime({
        input1: '',
        input2: '',
      });

      api.patch({ input1: 'a', input2: 'b' });

      // runtime 路径不应触发全量失效
      expect(markFullChange).not.toHaveBeenCalled();
    });
  });
});
