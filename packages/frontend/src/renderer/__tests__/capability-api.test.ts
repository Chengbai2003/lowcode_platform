import { describe, it, expect, vi } from 'vitest';
import { createCapabilityAPI } from '../executor/capability/capabilityAPI';

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

  it('set warns for unknown componentId but still writes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api, setComponentData, markFullChange } = createTestAPI({ input1: '' });
    api.set('unknownId', 'value');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown componentId "unknownId"'),
    );
    expect(setComponentData).toHaveBeenCalledWith('unknownId', 'value');
    expect(markFullChange).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
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

  it('patch warns for unknown componentIds but still writes all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api, setComponentData, markFullChange } = createTestAPI({
      input1: '',
    });
    api.patch({ input1: 'a', unknownId: 'b' });
    expect(setComponentData).toHaveBeenCalledWith('input1', 'a');
    expect(setComponentData).toHaveBeenCalledWith('unknownId', 'b');
    expect(markFullChange).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown componentId "unknownId"'),
    );
    warnSpy.mockRestore();
  });

  it('patch writes and calls markFullChange even when all IDs are unknown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api, setComponentData, markFullChange } = createTestAPI({
      input1: '',
    });
    api.patch({ unknownA: 'x', unknownB: 'y' });
    expect(setComponentData).toHaveBeenCalledWith('unknownA', 'x');
    expect(setComponentData).toHaveBeenCalledWith('unknownB', 'y');
    expect(markFullChange).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
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
});
