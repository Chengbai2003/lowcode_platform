/**
 * D10（M1b-1 PR D / 计划 §6.1）：真实编辑器集成链。
 *
 * 真实 LowcodeEditor 挂载，fetchApp 层不 mock——全部后端依赖由 loopback 回放
 * 服务承接（响应字节取自真实端点录制的共享 fixture；页面 GET 内容按测试场景
 * 提供）。D1 已证真实端点行为，此处证编辑器接线，不宣称前端跑了真 Nest。
 * 需 manifest+policy 测试注入（生产清单与默认策略字节不变）。
 *
 * 流程（与 §3.1 脏页规则一致，配置查询本身即变脏）：
 * 加载 v1 → 真实 UI 配置查询动作（目录选 operation、建声明、选 resultTo）→
 * 预览点击查询 → 被拒（execute 零请求）→ PUT 保存成功（v2）→ 再点击 →
 * 查询成功（body.pageVersion===2，UI 断言结果渲染）→ 再编辑再拒 →
 * 回放 409 绑定不刷新仍拒 → 切页（p2）旧绑定失效、新绑定生效。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CONSUMER_SURFACES, createTestCapabilityMatrix } from '@lowcode-platform/schema-contract';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { LowcodeEditor } from '../LowcodeEditor';
import { fetchApp } from '../lib/httpClient';

const require = createRequire(import.meta.url);

function patchManifestAndPolicy(): () => void {
  const manifestPath = path.join(
    path.dirname(require.resolve('@lowcode-platform/schema-contract')),
    'capabilities',
    'manifest.js',
  );
  const manifestModule = require(manifestPath);
  const policyModule = require(path.join(path.dirname(manifestPath), 'policy.js'));
  const original = manifestModule.getTrustedCapabilityManifest;
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  policyModule.getTrustedExecutionPolicy = () => 'operation-only';
  return () => {
    manifestModule.getTrustedCapabilityManifest = original;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  };
}

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../test-fixtures/m1b-d-editor-closure.json'),
    'utf8',
  ),
) as { endpointSamples: Record<string, Record<string, unknown>> };

const RUNTIME_COMPATIBILITY = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
};

const P1_BASE: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['searchBtn', 'rowsProbe'] },
    searchBtn: {
      id: 'searchBtn',
      type: 'Button',
      props: { children: '查询' },
    },
    rowsProbe: {
      id: 'rowsProbe',
      type: 'Span',
      props: { children: '{{ state.rows.items.length }}' },
    },
  },
  logic: { states: { query: '', rows: { items: [] } } },
};

interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

// jsdom 缺 ResizeObserver（SelectableCanvas 依赖）——与 b3/b4 编辑器测试同型桩
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

describe('Editor integration: data source closure (M1b-1 PR D / Refs #64) — D10', () => {
  const ORIGINAL_BASE = fetchApp.getBaseURL();
  let restorePatches: () => void;
  let server: http.Server;
  const executeRequests: RecordedRequest[] = [];
  const putRequests: RecordedRequest[] = [];
  let putCallCount = 0;
  let savedSchema: PageSchema | null = null;
  let errorSpy: {
    mock: { calls: unknown[][] };
    mockRestore(): void;
  };

  function startServer(): Promise<string> {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const body = bodyText ? JSON.parse(bodyText) : undefined;
        const url = req.url ?? '/';
        const json = (status: number, payload: unknown): void => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };

        if (req.method === 'GET' && url.startsWith('/api/v1/pages/p1/schema')) {
          json(200, {
            success: true,
            data: {
              pageId: 'p1',
              pageVersion: 1,
              snapshotId: 'snap-p1-1',
              savedAt: '2026-09-21T00:00:00.000Z',
              runtimeCompatibility: RUNTIME_COMPATIBILITY,
              schema: P1_BASE,
            },
            message: 'Success',
            timestamp: new Date().toISOString(),
            path: url,
          });
          return;
        }
        if (req.method === 'GET' && url.startsWith('/api/v1/pages/p2/schema')) {
          json(200, {
            success: true,
            data: {
              pageId: 'p2',
              pageVersion: 1,
              snapshotId: 'snap-p2-1',
              savedAt: '2026-09-21T00:00:00.000Z',
              runtimeCompatibility: RUNTIME_COMPATIBILITY,
              schema: savedSchema ?? P1_BASE,
            },
            message: 'Success',
            timestamp: new Date().toISOString(),
            path: url,
          });
          return;
        }
        if (req.method === 'PUT' && /\/api\/v1\/pages\/p[12]\/schema$/.test(url)) {
          putRequests.push({ method: 'PUT', url, body });
          putCallCount += 1;
          // p1：第一次保存成功（v2），之后回放 409；p2：恒成功
          const isP2 = url.includes('/p2/');
          const succeed = isP2 || putCallCount === 1;
          if (succeed) {
            savedSchema = (body as { schema: PageSchema }).schema;
            json(200, {
              success: true,
              data: {
                pageId: isP2 ? 'p2' : 'p1',
                pageVersion: isP2 ? 1 : 2,
                snapshotId: `snap-${putCallCount}`,
                savedAt: '2026-09-21T00:00:00.000Z',
              },
              message: 'Success',
              timestamp: new Date().toISOString(),
              path: url,
            });
          } else {
            json(409, {
              statusCode: 409,
              message: 'Page version mismatch',
              error: 'Conflict',
              timestamp: new Date().toISOString(),
              path: url,
              details: { expectedVersion: 2, receivedVersion: 1 },
            });
          }
          return;
        }
        if (req.method === 'GET' && url.startsWith('/api/v1/data-source/operations')) {
          json(200, {
            success: true,
            data: {
              operations: [
                {
                  operationId: 'demo.items.search',
                  revision: '1',
                  title: 'Demo Items Search',
                  description: 'Read-only demo item search backed by an isolated loopback service.',
                  kind: 'readonly-query',
                  paramsContract: {
                    query: { type: 'string', required: false, maxLength: 128 },
                    limit: { type: 'integer', required: false, min: 1, max: 50 },
                  },
                },
              ],
            },
            message: 'Success',
            timestamp: new Date().toISOString(),
            path: url,
          });
          return;
        }
        if (
          req.method === 'POST' &&
          /\/api\/v1\/pages\/p[12]\/data-sources\/searchItems\/execute$/.test(url)
        ) {
          executeRequests.push({ method: 'POST', url, body });
          json(200, fixture.endpointSamples.executeSuccess);
          return;
        }
        json(404, { statusCode: 404, message: 'Not Found', error: 'Not Found' });
      });
    });
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      });
    });
  }

  beforeEach(async () => {
    restorePatches = patchManifestAndPolicy();
    executeRequests.length = 0;
    putRequests.length = 0;
    putCallCount = 0;
    savedSchema = null;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const serverUrl = await startServer();
    fetchApp.setBaseURL(serverUrl);
  });

  afterEach(async () => {
    fetchApp.setBaseURL(ORIGINAL_BASE);
    restorePatches();
    errorSpy.mockRestore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function settle(ms = 30): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  function clickCanvasQueryButton(): void {
    const button = screen.getAllByText(/查\s*询/).find((element) => element.closest('button')) as
      | HTMLElement
      | undefined;
    expect(button, 'canvas query button rendered').toBeTruthy();
    fireEvent.click(button!);
  }

  it('配置变脏先拒 → 保存 v2 → 携 v2 查询成功 → 再编辑再拒 → 409 仍拒 → 切页失效', async () => {
    const { unmount } = render(<LowcodeEditor pageId="p1" projectName="d10" />);

    // 加载 v1 完成（按钮渲染即加载成功）
    await waitFor(() => {
      expect(screen.getAllByText(/查\s*询/).length).toBeGreaterThan(0);
    });
    await settle();

    // --- 真实 UI 配置查询动作 ---
    fireEvent.click(screen.getAllByText(/查\s*询/)[0]); // 选中按钮（编辑模式）
    await settle();
    fireEvent.click(screen.getByText('事件')); // PropertyPanel 事件 tab
    await settle();
    fireEvent.click(screen.getByText('添加事件监听'));
    await settle();
    fireEvent.click(screen.getByText('onClick'));
    await settle();
    // 事件流已建（空 actions）→ 点击行头「+」打开动作选择器
    const onClickLabel = screen.getByText('onClick');
    const flowHeader = (onClickLabel.closest('[class*="flowHeader"]') ??
      onClickLabel.parentElement?.parentElement) as HTMLElement;
    const addActionButton = flowHeader.querySelector('button') as HTMLElement;
    expect(addActionButton).toBeTruthy();
    fireEvent.click(addActionButton);
    await settle();
    fireEvent.click(screen.getByText('数据源查询')); // ActionSelectorModal
    await settle();

    // 展开动作编辑器（动作卡片「配置」按钮）
    fireEvent.click(await screen.findByText('配置'));
    await settle();

    // 新建查询：目录（真实 HTTP 回放）→ 选 operation → 命名 sourceId → 创建声明
    fireEvent.click(screen.getByText('新建查询'));
    const operationSelect = await screen.findByLabelText('数据源操作');
    await waitFor(() => {
      expect(
        Array.from(operationSelect.querySelectorAll('option')).some(
          (option) => option.value === 'demo.items.search@1',
        ),
      ).toBe(true);
    });
    fireEvent.change(operationSelect, { target: { value: 'demo.items.search@1' } });
    fireEvent.change(screen.getByLabelText('新数据源声明 ID'), {
      target: { value: 'searchItems' },
    });
    fireEvent.click(screen.getByText('创建声明并绑定'));
    await settle();

    // resultTo → state.rows
    fireEvent.change(screen.getByLabelText('结果写入目标'), {
      target: { value: 'state.rows' },
    });
    await settle();

    // 配置本身即变脏：未保存 → 提示可见
    expect(screen.getByTestId('datasource-save-first-hint')).toBeTruthy();

    // --- 预览点击：被拒（execute 零请求） ---
    clickCanvasQueryButton();
    await settle(60);
    expect(executeRequests).toEqual([]);
    expect(
      errorSpy.mock.calls.some((args) =>
        args
          .map((arg) => String(arg))
          .join(' ')
          .includes('save the page first'),
      ),
    ).toBe(true);

    // --- 保存成功（PUT #1 → v2）→ 提示消失 ---
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      expect(putRequests).toHaveLength(1);
    });
    await settle(60);
    expect(screen.queryByTestId('datasource-save-first-hint')).toBeNull();

    // --- 再点击：查询成功，请求携带 v2，UI 断言结果渲染 ---
    clickCanvasQueryButton();
    await waitFor(() => {
      expect(executeRequests).toHaveLength(1);
    });
    expect(executeRequests[0].url).toBe('/api/v1/pages/p1/data-sources/searchItems/execute');
    expect(executeRequests[0].body).toMatchObject({ pageVersion: 2 });
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy(); // Span 探针：rows.items.length === 2
    });

    // --- 再编辑（切换 resultTo）→ 再点被拒 ---
    fireEvent.click(screen.getAllByText(/查\s*询/)[0]);
    await settle();
    fireEvent.click(screen.getByText('事件'));
    await settle();
    await screen.findByText('onClick'); // 确认按钮的事件流面板在位
    // 编辑器可能自轮 1 起仍处展开态（配置按钮是 toggle）——按需点击
    if (!screen.queryByLabelText('结果写入目标')) {
      const currentOnClickLabel = screen.getByText('onClick');
      const currentFlowRoot = (currentOnClickLabel.closest('[class*="eventFlow"]') ??
        currentOnClickLabel.closest('[class*="flowList"]')) as HTMLElement;
      const currentConfigButton = Array.from(currentFlowRoot.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('配置'),
      ) as HTMLElement;
      expect(currentConfigButton).toBeTruthy();
      fireEvent.click(currentConfigButton);
      await settle();
    }
    fireEvent.change(await screen.findByLabelText('结果写入目标'), {
      target: { value: 'state.query' },
    });
    await settle();
    clickCanvasQueryButton();
    await settle(60);
    expect(executeRequests).toHaveLength(1); // 仍被拒，零新请求

    // --- 保存回放 409 → 绑定不刷新仍拒 ---
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      expect(putRequests).toHaveLength(2);
    });
    await settle(60);
    clickCanvasQueryButton();
    await settle(60);
    expect(executeRequests).toHaveLength(1);

    unmount();

    // --- 切页：p2 加载已配置页面（v1）→ 旧绑定失效、新绑定生效 ---
    render(<LowcodeEditor key="p2" pageId="p2" projectName="d10-p2" />);
    await waitFor(() => {
      expect(screen.getAllByText(/查\s*询/).length).toBeGreaterThan(0);
    });
    await settle();
    clickCanvasQueryButton();
    await waitFor(() => {
      expect(executeRequests).toHaveLength(2);
    });
    expect(executeRequests[1].url).toBe('/api/v1/pages/p2/data-sources/searchItems/execute');
    expect(executeRequests[1].body).toMatchObject({ pageVersion: 1 });
  }, 60000);
});
