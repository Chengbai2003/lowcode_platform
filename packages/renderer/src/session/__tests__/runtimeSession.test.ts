import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeSession,
  createRuntimeSessionManager,
  RuntimeSession,
} from '../RuntimeSession';
import { EventDispatcher } from '../../EventDispatcher';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RuntimeSession (M0-4 Scope D)', () => {
  it('createRuntimeSession 每次返回完全隔离的 Session（同 Schema 两次挂载不共享状态）', () => {
    const a = createRuntimeSession({ pageId: 'p1', documentSessionId: 'd1' });
    const b = createRuntimeSession({ pageId: 'p1', documentSessionId: 'd1' });

    expect(a.runtime).not.toBe(b.runtime);
    expect(a.dispatcher).not.toBe(b.dispatcher);

    a.runtime.set('data.x', 'from-a');
    expect(b.runtime.get('data.x')).toBeUndefined();
  });

  it('Session 身份绑定 pageId + documentSessionId（空值 fail-close）', () => {
    expect(() => createRuntimeSession({ pageId: '', documentSessionId: 'd' })).toThrow(/pageId/);
    expect(() => createRuntimeSession({ pageId: 'p', documentSessionId: '' })).toThrow(
      /documentSessionId/,
    );
  });

  it('RuntimeSessionManager：同身份复用；documentSessionId 变化时销毁旧 Session', () => {
    const manager = createRuntimeSessionManager();
    const first = manager.getOrCreate({ pageId: 'page-1', documentSessionId: 'doc-1' });
    expect(manager.getOrCreate({ pageId: 'page-1', documentSessionId: 'doc-1' })).toBe(first);

    const second = manager.getOrCreate({ pageId: 'page-1', documentSessionId: 'doc-2' });
    expect(second).not.toBe(first);
    expect(first.isDisposed()).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(second.isDisposed()).toBe(false);
  });

  it('dispose：幂等、abort signal、拒绝后续 delay、清理登记 timer', async () => {
    const session = createRuntimeSession({ pageId: 'p2', documentSessionId: 'd1' });
    const fired: string[] = [];
    session.registerTimeout(() => fired.push('timer'), 10_000);
    const pendingDelay = session.delay(10_000).catch((error: Error) => error.name);

    session.dispose();
    session.dispose(); // 幂等

    expect(session.isDisposed()).toBe(true);
    expect(session.signal.aborted).toBe(true);
    expect(await pendingDelay).toBe('AbortError');
    expect(() => session.delay(1)).toThrow(/disposed/);

    await sleep(20);
    expect(fired).toEqual([]); // dispose 后登记 timer 不执行

    expect(session.generation).toBe(1);
    expect(session.isCurrent(0)).toBe(false);
  });

  it('RuntimeSessionManager.dispose 清理会话（页面离开语义）', () => {
    const manager = createRuntimeSessionManager();
    const session = manager.getOrCreate({ pageId: 'p3', documentSessionId: 'd1' });
    manager.dispose('p3');
    expect(session.isDisposed()).toBe(true);
    expect(manager.getOrCreate({ pageId: 'p3', documentSessionId: 'd1' })).not.toBe(session);
  });

  it('dispose 后旧 apiCall 异步回调不得写回状态（结果静默丢弃）', async () => {
    const request = vi.fn(async () => ({ users: [1, 2, 3] }));
    // 只提供 request：apiCall 在无 get/post 方法时回落到 api.request
    const dispatcher = new EventDispatcher({ api: { request } });
    const session = createRuntimeSession({ pageId: 'p4', documentSessionId: 'd1', dispatcher });
    session.dispatcher.setHostConfig('session', session);
    session.dispose();

    const batch = await dispatcher.execute([
      { type: 'apiCall', url: 'https://example.test/api', resultTo: 'data.result' } as never,
    ]);
    const result = (batch as { results: Array<{ value: { aborted?: boolean } }> }).results[0].value;

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(session.runtime.get('data.result')).toBeUndefined();
  });

  it('Session 内 apiCall（宿主 api 客户端）正常路径写回 resultTo', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const session = createRuntimeSession({
      pageId: 'p5',
      documentSessionId: 'd1',
      dispatcher: new EventDispatcher({ api: { request } }),
    });
    const batch = await session.dispatcher.execute([
      { type: 'apiCall', url: 'https://example.test/api', resultTo: 'data.result' } as never,
    ]);
    const result = (batch as { results: Array<{ value: { success?: boolean } }> }).results[0].value;
    expect(result.success).toBe(true);
    expect(session.runtime.get('data.result')).toEqual({ ok: true });
  });

  it('fetch 路径携带 Session signal；dispose 中止 in-flight 请求且不写回', async () => {
    const session = createRuntimeSession({ pageId: 'p5b', documentSessionId: 'd1' });
    const { apiCall } = await import('../../executor/actions/asyncActions');

    // 1) 请求配置携带 Session signal
    await apiCall(
      { type: 'apiCall', url: 'https://example.test/api', resultTo: 'data.result' },
      { runtime: session.runtime, session, hostCapabilities: { network: true } } as never,
      undefined,
    );
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      signal: session.signal,
    });

    // 2) dispose 中止 in-flight：fetch 等待 signal → reject → apiCall 静默返回 aborted
    const hangUntilAbort = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    vi.stubGlobal('fetch', hangUntilAbort);
    const inFlight = apiCall(
      { type: 'apiCall', url: 'https://example.test/api', resultTo: 'data.result2' },
      { runtime: session.runtime, session, hostCapabilities: { network: true } } as never,
      undefined,
    );
    await sleep(5);
    session.dispose();
    const aborted = await inFlight;
    expect((aborted as { aborted?: boolean }).aborted).toBe(true);
    expect(session.runtime.get('data.result2')).toBeUndefined();
    expect(hangUntilAbort).toHaveBeenCalledTimes(1);
  });

  it('delay 正常完成后 resolve；dispose 中途取消返回 aborted（经 execute）', async () => {
    const session = createRuntimeSession({ pageId: 'p6', documentSessionId: 'd1' });
    session.dispatcher.setHostConfig('session', session);

    const unwrap = (batch: unknown) =>
      (batch as { results: Array<{ value: unknown }> }).results[0].value;

    const done = unwrap(await session.dispatcher.execute([{ type: 'delay', ms: 20 } as never]));
    expect(done).toEqual({ delayed: 20 });

    const midDelay = session.dispatcher.execute([{ type: 'delay', ms: 10_000 } as never]);
    await sleep(5);
    session.dispose();
    expect(unwrap(await midDelay)).toEqual({ delayed: 10_000, aborted: true });
  });

  it('trackCleanup 在 dispose 时统一执行', () => {
    const session = createRuntimeSession({ pageId: 'p7', documentSessionId: 'd1' });
    const cleanup = vi.fn();
    session.trackCleanup(cleanup);
    session.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

// fetch mock：apiCall 默认 fetch 路径
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ ok: true }),
  })),
);

// 类型引用占位：保证 RuntimeSession 类型导出可用
export type SessionType = RuntimeSession;
