import { describe, expect, it, vi } from 'vitest';
import { createCapabilityAPI } from '../executor/capability/capabilityAPI';
import { ReactiveRuntime } from '../reactive';

describe('CapabilityAPI', () => {
  function createTestAPI(componentIds: string[], seed: Record<string, unknown> = {}) {
    const runtime = new ReactiveRuntime();
    runtime.initialize({
      data: seed,
      components: Object.fromEntries(componentIds.map((id) => [id, { id }])),
    });

    const api = createCapabilityAPI({
      validComponentIds: new Set(componentIds),
      runtime,
    });

    return { api, runtime };
  }

  it('get reads component values from runtime', () => {
    const { api } = createTestAPI(['input1', 'input2'], { input1: 'hello', input2: 42 });

    expect(api.get('input1')).toBe('hello');
    expect(api.get('input2')).toBe(42);
  });

  it('get warns for unknown componentId but returns undefined', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = createTestAPI(['input1']);

    expect(api.get('nonexistent')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown componentId'));
  });

  it('set writes through runtime.set', () => {
    const { api, runtime } = createTestAPI(['input1']);
    const setSpy = vi.spyOn(runtime, 'set');

    api.set('input1', 'new value');

    expect(setSpy).toHaveBeenCalledWith('input1', 'new value');
    expect(runtime.get('input1')).toBe('new value');
  });

  it('patch writes through runtime.patch', () => {
    const { api, runtime } = createTestAPI(['input1', 'input2']);
    const patchSpy = vi.spyOn(runtime, 'patch');

    api.patch({ input1: 'a', input2: 'b' });

    expect(patchSpy).toHaveBeenCalledWith({ input1: 'a', input2: 'b' });
    expect(runtime.get('input1')).toBe('a');
    expect(runtime.get('input2')).toBe('b');
  });

  it('set rejects unknown componentId', () => {
    const { api, runtime } = createTestAPI(['input1']);
    const setSpy = vi.spyOn(runtime, 'set');

    expect(() => api.set('unknownId', 'value')).toThrow('Unknown componentId "unknownId"');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('patch rejects non-object input', () => {
    const { api } = createTestAPI(['input1']);
    expect(() => api.patch(null as any)).toThrow('patch expects a plain object');
    expect(() => api.patch(['input1'] as any)).toThrow('patch expects a plain object');
  });

  it('patch rejects unknown and forbidden component ids', () => {
    const { api, runtime } = createTestAPI(['input1']);
    const patchSpy = vi.spyOn(runtime, 'patch');

    expect(() => api.patch({ input1: 'a', unknownId: 'b' })).toThrow(
      'Unknown componentId "unknownId"',
    );
    expect(() => api.patch({ constructor: 'boom' } as any)).toThrow('Forbidden componentId');
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('log proxies to console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { api } = createTestAPI(['input1']);

    api.log('test message', 123);

    expect(logSpy).toHaveBeenCalledWith('[Sandbox Log]:', 'test message', 123);
  });
});
