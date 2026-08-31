import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { EventDispatcher } from '../EventDispatcher';
import { Renderer } from '../Renderer';
import {
  DEFAULT_HOST_CAPABILITIES,
  getHostCapabilities,
  isCapabilityGranted,
  normalizeHostCapabilities,
} from '../host/HostCapabilities';
import { testPreset } from './fixtures/testPreset';
import { safeEvaluate } from '../executor/parser/safeEvaluator';
import type { HostCapabilities } from '../host/HostCapabilities';

describe('HostCapabilities（M0-4 Scope E）', () => {
  it('默认能力集全 deny 且冻结', () => {
    expect(DEFAULT_HOST_CAPABILITIES).toEqual({
      navigation: false,
      dialogs: false,
      network: false,
      dataResources: false,
    });
    expect(Object.isFrozen(DEFAULT_HOST_CAPABILITIES)).toBe(true);
  });

  it('normalize：未知键忽略、非 true 一律 deny、返回冻结对象', () => {
    const caps = normalizeHostCapabilities({
      navigation: true,
      network: 'yes' as never,
      evil: true,
    } as never);
    expect(caps).toEqual({
      navigation: true,
      dialogs: false,
      network: false,
      dataResources: false,
    });
    expect(Object.isFrozen(caps)).toBe(true);
    expect(normalizeHostCapabilities(null)).toEqual(DEFAULT_HOST_CAPABILITIES);
  });

  it('isCapabilityGranted 仅显式 true 授予（fail-close）', () => {
    expect(isCapabilityGranted({ navigation: true } as HostCapabilities, 'navigation')).toBe(true);
    expect(isCapabilityGranted(undefined, 'navigation')).toBe(false);
    expect(isCapabilityGranted(DEFAULT_HOST_CAPABILITIES, 'network')).toBe(false);
    expect(getHostCapabilities({})).toEqual(DEFAULT_HOST_CAPABILITIES);
  });

  it('默认 deny：navigate 无宿主注入时内置回退被拒绝', async () => {
    const dispatcher = new EventDispatcher({});
    dispatcher.setHostConfig('hostCapabilities', DEFAULT_HOST_CAPABILITIES);
    const batch = await dispatcher.execute([{ type: 'navigate', to: '/login' } as never]);
    expect(batch.failed).toBe(1);
    expect((batch as { results: Array<{ error?: Error }> }).results[0].error?.message).toContain(
      'Host capability denied',
    );
  });

  it('宿主注入 context.navigate 不受门控约束（显式注入即授权）', async () => {
    const navigate = vi.fn();
    const dispatcher = new EventDispatcher({ navigate });
    await dispatcher.execute([{ type: 'navigate', to: '/login?id=7' } as never]);
    expect(navigate).toHaveBeenCalledWith('/login?id=7');
  });

  it('默认 deny：dialog 原生 confirm/alert 回退被抑制（confirmed=false）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { dialog } = await import('../executor/actions/uiActions');
    const result = (await dialog(
      { type: 'dialog', kind: 'confirm', content: 'sure?' },
      { hostCapabilities: DEFAULT_HOST_CAPABILITIES } as never,
      undefined,
    )) as { confirmed: boolean };
    expect(result.confirmed).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('授予 dialogs 后原生 confirm 回退生效', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { dialog } = await import('../executor/actions/uiActions');
    const result = (await dialog(
      { type: 'dialog', kind: 'confirm', content: 'sure?' },
      { hostCapabilities: normalizeHostCapabilities({ dialogs: true }) } as never,
      undefined,
    )) as { confirmed: boolean };
    expect(result.confirmed).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('默认 deny：apiCall 内置 fetch 回退被拒绝；授予 network 后放行', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiCall } = await import('../executor/actions/asyncActions');

    await expect(
      apiCall(
        { type: 'apiCall', url: 'https://example.test/api' },
        { runtime: null } as never,
        undefined,
      ),
    ).rejects.toThrow(/Host capability denied: "network"/);

    await expect(
      apiCall(
        { type: 'apiCall', url: 'https://example.test/api' },
        { runtime: null, hostCapabilities: { network: true } } as never,
        undefined,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('宿主函数不进入表达式上下文（sanitizeContext 克隆丢函数）', () => {
    const context = {
      data: { x: 1 },
      dispatch: vi.fn(),
      getState: vi.fn(),
      ui: { message: { error: vi.fn() } },
      session: { dispose: vi.fn() },
    };
    expect(safeEvaluate('typeof dispatch', context)).toBe('undefined');
    expect(safeEvaluate('typeof getState', context)).toBe('undefined');
    expect(safeEvaluate('typeof ui', context)).toBe('undefined');
    expect(safeEvaluate('data.x', context)).toBe(1);
  });

  it('Renderer 端到端：默认 deny 时 confirm 不触发（默认 UI 恒 false + 原生回退被抑制）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const schema = {
      schemaVersion: 0 as const,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['btn'] },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'open dialog' },
          events: { onClick: [{ type: 'dialog', kind: 'confirm', content: 'sure?' }] },
        },
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Renderer
        preset={testPreset}
        pageId="p-caps"
        documentSessionId="doc-1"
        schema={schema as never}
      />,
    );

    fireEvent.click(screen.getByText('open dialog'));
    await new Promise((r) => setTimeout(r, 10));
    // 默认 deny：默认 UI modal.confirm 恒 false、原生 confirm 不触发
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    warn.mockRestore();
  });
});
