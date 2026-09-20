/**
 * M1b-1 PR C：Renderer 侧 executeDataSource 执行语义（R1–R8 / X1）。
 *
 * 可信测试配置：进程内以 createTestCapabilityMatrix 放行 data-source
 * （生产清单字节不变）；R1 使用真实 loopback HTTP 服务证明真实异步链路。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as http from 'node:http';
import { createRequire } from 'node:module';
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import {
  CONSUMER_SURFACES,
  analyzeActionFlowDeclarations,
  createCanonicalPageSchema,
  createTestCapabilityMatrix,
  type DataSourceExecutionOutcome,
  type JsonValue,
  type PageSchema,
} from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import { EventDispatcher } from '../EventDispatcher';
import { createRuntimeSession, type RuntimeSession } from '../session/RuntimeSession';
import { normalizeHostCapabilities } from '../host/HostCapabilities';
import { testPreset } from './fixtures/testPreset';

const require = createRequire(import.meta.url);

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
) as { schema: PageSchema; flowSchema: PageSchema; legacyApiCallSchema: PageSchema };

/** 进程内可信测试矩阵（生产清单字节不变；C 正向测试的唯一放行通道） */
function patchManifestForTestMatrix(): () => void {
  const manifestPath = path.join(
    path.dirname(require.resolve('@lowcode-platform/schema-contract')),
    'capabilities',
    'manifest.js',
  );
  const manifestModule = require(manifestPath);
  const original = manifestModule.getTrustedCapabilityManifest;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  return () => {
    manifestModule.getTrustedCapabilityManifest = original;
  };
}

type ScriptedOutcome =
  | { ok: true; result: JsonValue; operationId?: string; revision?: string; traceId?: string }
  | { ok: false; code: string; message: string; traceId?: string };

interface ScriptedService {
  service: {
    execute: (
      input: { sourceId: string; params?: Record<string, unknown> },
      signal?: AbortSignal,
    ) => Promise<DataSourceExecutionOutcome>;
  };
  calls: Array<{ sourceId: string; params: Record<string, unknown> | undefined }>;
  aborts: number;
}

function createScriptedService(
  outcomes: ScriptedOutcome[],
  options?: { delayMs?: number },
): ScriptedService {
  const state: ScriptedService = {
    calls: [],
    aborts: 0,
    service: undefined as never,
  };
  let index = 0;
  state.service = {
    execute: (input, signal) =>
      new Promise<DataSourceExecutionOutcome>((resolve, reject) => {
        state.calls.push({ sourceId: input.sourceId, params: input.params });
        const onAbort = () => {
          state.aborts += 1;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          const outcome = outcomes[Math.min(index, outcomes.length - 1)];
          index += 1;
          resolve(outcome as DataSourceExecutionOutcome);
        }, options?.delayMs ?? 0);
      }),
  };
  return state;
}

interface DispatcherHarness {
  session: RuntimeSession;
  dispatcher: EventDispatcher;
}

function createDispatcherHarness(options?: {
  service?: ScriptedService['service'] | undefined;
  grantDataResources?: boolean;
  state?: Record<string, unknown>;
  declarations?: Record<string, unknown>;
}): DispatcherHarness {
  const session = createRuntimeSession({
    pageId: 'ds-runtime-page',
    documentSessionId: 'ds-runtime-doc',
    dispatcherInit: {
      state: options?.state ?? { query: 'apple', rows: [] },
    },
  });
  const dispatcher = session.dispatcher;
  dispatcher.setHostConfig(
    'hostCapabilities',
    normalizeHostCapabilities(options?.grantDataResources === false ? {} : { dataResources: true }),
  );
  dispatcher.setHostConfig(
    'dataSourceDeclarations',
    structuredClone(options?.declarations ?? m1bFixture.schema.logic?.dataSources),
  );
  if (options?.service !== undefined) {
    dispatcher.setContext('dataSources', options.service);
  }
  return { session, dispatcher };
}

async function executeAction(harness: DispatcherHarness, action: unknown): Promise<unknown> {
  return harness.dispatcher.execute([action] as never);
}

/** 本地双声明 schema（R7：两个 sourceId 写同一 resultTo） */
function buildTwoSourceSchema(): PageSchema {
  return createCanonicalPageSchema({
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['btn'] },
      btn: { id: 'btn', type: 'Button', props: { children: 'go' }, events: {} },
    },
    logic: {
      states: { rows: [] },
      dataSources: {
        sourceA: {
          operationRef: { operationId: 'demo.items.search', revision: '1' },
        },
        sourceB: {
          operationRef: { operationId: 'demo.items.search', revision: '1' },
        },
      },
    },
  });
}

/** 本地 Flow schema（R6：executeDataSource 步骤 + setValue onError 探针） */
function buildFlowSchema(): PageSchema {
  return createCanonicalPageSchema({
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: [] },
    },
    logic: {
      states: { rows: [], handled: false },
      dataSources: {
        searchItems: {
          operationRef: { operationId: 'demo.items.search', revision: '1' },
        },
      },
      flows: {
        searchFlow: {
          steps: [
            {
              type: 'executeDataSource',
              sourceId: 'searchItems',
              resultTo: 'state.rows',
            } as never,
          ],
          onError: [{ type: 'setValue', field: 'state.handled', value: true } as never],
        },
      },
    },
  });
}

describe('Renderer executeDataSource runtime (M1b-1 PR C / Refs #64)', () => {
  let restoreManifest: (() => void) | undefined;

  beforeEach(() => {
    restoreManifest = patchManifestForTestMatrix();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    restoreManifest?.();
  });

  it('R1: mounted success chain through a real loopback HTTP upstream', async () => {
    // 受控 loopback 服务：真实 HTTP + 真实异步
    const upstreamHits: Array<Record<string, unknown>> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        upstreamHits.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: { items: [{ id: 'a', title: 'Apple' }] },
            operationId: 'demo.items.search',
            revision: '1',
            traceId: 'trace-r1',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;

    const adapterRequests: Array<{ sourceId: string; params?: Record<string, unknown> }> = [];
    const service = {
      execute: async (
        input: { sourceId: string; params?: Record<string, unknown> },
        signal?: AbortSignal,
      ): Promise<DataSourceExecutionOutcome> => {
        adapterRequests.push({ sourceId: input.sourceId, params: input.params });
        const response = await fetch(`http://127.0.0.1:${port}/exec`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal,
        });
        return (await response.json()) as DataSourceExecutionOutcome;
      },
    };

    // 挂载变体 schema（非钉死 fixture 本体）：Text 探针展示 rows.items.length
    // （rows 初始值改为对象，保证模板路径在写入前后都渲染为合法 React child）
    const variant = JSON.parse(JSON.stringify(m1bFixture.schema));
    variant.logic.states.rows = { items: [] };
    variant.components.root.childrenIds = ['searchBtn', 'probe'];
    variant.components.probe = {
      id: 'probe',
      type: 'Text',
      props: { children: '{{ state.rows.items.length }}' },
    };

    render(
      <Renderer
        schema={variant}
        preset={testPreset}
        pageId="r1-page"
        documentSessionId="r1-doc"
        hostCapabilities={{ dataResources: true }}
        eventContext={{ dataSources: service }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '查询' }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 真实链路：适配器 → loopback → 校验后的 Outcome → 整值写入 state.rows
    expect(adapterRequests).toEqual([{ sourceId: 'searchItems', params: { query: '' } }]);
    expect(upstreamHits).toEqual([{ sourceId: 'searchItems', params: { query: '' } }]);
    // 写入后探针从 0 变为 1：state.rows 被整值替换且触发重渲染
    expect(screen.getByText('1')).toBeTruthy();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('R2: params are evaluated once and frozen at execution start', async () => {
    const script = createScriptedService([{ ok: true, result: { items: ['frozen'] } }], {
      delayMs: 60,
    });
    const harness = createDispatcherHarness({ service: script.service });
    const execution = executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 快照后修改 state，不影响已发出的请求
    harness.dispatcher.setContext('state', { query: 'changed-later', rows: [] });
    await execution;

    expect(script.calls).toEqual([{ sourceId: 'searchItems', params: { query: 'apple' } }]);
  });

  it('R3: latest-started-wins — the older run is aborted and its late result discarded', async () => {
    const script = createScriptedService(
      [
        { ok: true, result: { items: ['slow-first'] } },
        { ok: true, result: { items: ['fast-second'] } },
      ],
      { delayMs: 80 },
    );
    const harness = createDispatcherHarness({ service: script.service });

    const first = executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    });
    const firstBatch = (await first) as {
      results: Array<{ value?: { success: boolean; superseded?: boolean } }>;
    };

    expect(script.aborts).toBe(1);
    expect(script.calls).toHaveLength(2);
    expect(firstBatch.results[0].value).toMatchObject({ success: false });
    expect(harness.session.runtime.getState().rows).toEqual({ items: ['fast-second'] });
  });

  it('R4: dispose aborts in-flight runs and a fresh session is never touched', async () => {
    const script = createScriptedService([{ ok: true, result: { items: ['late'] } }], {
      delayMs: 120,
    });
    const oldHarness = createDispatcherHarness({ service: script.service });
    const newHarness = createDispatcherHarness({ service: script.service });

    const pending = executeAction(oldHarness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    }).catch(() => undefined) as Promise<unknown>;
    await new Promise((resolve) => setTimeout(resolve, 10));

    oldHarness.session.dispose();
    await pending;

    expect(script.aborts).toBe(1);
    // 旧 Session 的迟到结果不写入；新 Session 状态保持初始值
    expect(oldHarness.session.runtime.getState().rows).toEqual([]);
    expect(newHarness.session.runtime.getState().rows).toEqual([]);
    expect(newHarness.session.isDisposed()).toBe(false);
  });

  it('R5: missing host service or capability fails closed with zero host calls', async () => {
    const script = createScriptedService([{ ok: true, result: { items: [] } }]);
    const errorLogs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorLogs.push(args.map(String).join(' '));
    });

    try {
      // 缺能力（服务已注入）：Engine 捕获为批次失败并记录结构化错误
      const noCap = createDispatcherHarness({
        service: script.service,
        grantDataResources: false,
      });
      const noCapBatch = (await executeAction(noCap, {
        type: 'executeDataSource',
        sourceId: 'searchItems',
        resultTo: 'state.rows',
      })) as { failed: number };
      expect(noCapBatch.failed).toBe(1);

      // 缺服务函数（能力已授予）：同一 fail-close gate
      const noService = createDispatcherHarness({
        service: undefined,
        grantDataResources: true,
      });
      const noServiceBatch = (await executeAction(noService, {
        type: 'executeDataSource',
        sourceId: 'searchItems',
        resultTo: 'state.rows',
      })) as { failed: number };
      expect(noServiceBatch.failed).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }

    expect(errorLogs.join('\n')).toContain('dataResources');
    // gate 拒绝发生在任何宿主调用之前
    expect(script.calls).toHaveLength(0);
  });

  it('R6: flow TIMEOUT is recoverable (onError runs, old value kept); cancel skips onError', async () => {
    const flowSchema = buildFlowSchema();
    const flowAnalysis = analyzeActionFlowDeclarations(
      flowSchema.logic!.flows!,
      undefined,
      ['logic', 'flows'],
      {
        declaredDataSourceKeys: new Set(Object.keys(flowSchema.logic!.dataSources!)),
        declaredStateKeys: new Set(Object.keys(flowSchema.logic!.states!)),
      },
    );
    expect(flowAnalysis.ok).toBe(true);

    // TIMEOUT：可恢复 → Flow onError 执行，rows 保留旧值
    const timeoutScript = createScriptedService([
      { ok: false, code: 'TIMEOUT', message: 'deadline exceeded', traceId: 'trace-r6' },
    ]);
    const timeoutHarness = createDispatcherHarness({
      service: timeoutScript.service,
      state: { rows: ['old-value'], handled: false },
    });
    timeoutHarness.session.configureFlows(flowAnalysis.ok ? flowAnalysis.value : undefined);
    const recovered = await timeoutHarness.session.executeFlow('searchFlow');
    expect(recovered.status).toBe('recovered');
    expect(timeoutHarness.session.runtime.getState().handled).toBe(true);
    expect(timeoutHarness.session.runtime.getState().rows).toEqual(['old-value']);

    // 取消（dispose 中止 in-flight）：不可恢复 → onError 不执行
    const hangScript = createScriptedService([{ ok: true, result: { items: ['late'] } }], {
      delayMs: 150,
    });
    const cancelHarness = createDispatcherHarness({
      service: hangScript.service,
      state: { rows: ['old-value'], handled: false },
    });
    cancelHarness.session.configureFlows(flowAnalysis.ok ? flowAnalysis.value : undefined);
    const pending = cancelHarness.session
      .executeFlow('searchFlow')
      .catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 20));
    cancelHarness.session.dispose();
    const cancelError = (await pending) as { code?: string };

    expect(cancelError.code).toBe('FLOW_ABORTED');
    expect(cancelHarness.session.runtime.getState().handled).toBe(false);
    expect(cancelHarness.session.runtime.getState().rows).toEqual(['old-value']);
    expect(hangScript.aborts).toBe(1);
  });

  it('R7: different sources sharing one resultTo commit in success order (no cross-source latest-wins)', async () => {
    const schema = buildTwoSourceSchema();
    const outcomesBySource: Record<string, ScriptedOutcome[]> = {
      sourceA: [{ ok: true, result: { items: ['A-committed-last'] } }],
      sourceB: [{ ok: true, result: { items: ['B-first'] } }],
    };
    const delays: Record<string, number> = { sourceA: 80, sourceB: 10 };
    const state = {
      calls: [] as Array<{ sourceId: string }>,
      service: undefined as never,
    };
    state.service = {
      execute: (input: { sourceId: string }) =>
        new Promise<DataSourceExecutionOutcome>((resolve) => {
          state.calls.push({ sourceId: input.sourceId });
          const [outcome] = outcomesBySource[input.sourceId];
          setTimeout(() => resolve(outcome as DataSourceExecutionOutcome), delays[input.sourceId]);
        }),
    };

    const session = createRuntimeSession({
      pageId: 'r7-page',
      documentSessionId: 'r7-doc',
      dispatcherInit: { state: { rows: [] } },
    });
    session.dispatcher.setHostConfig(
      'hostCapabilities',
      normalizeHostCapabilities({ dataResources: true }),
    );
    session.dispatcher.setHostConfig('dataSourceDeclarations', schema.logic?.dataSources);
    session.dispatcher.setContext('dataSources', state.service);

    await Promise.all([
      session.dispatcher.execute([
        { type: 'executeDataSource', sourceId: 'sourceA', resultTo: 'state.rows' },
      ] as never),
      session.dispatcher.execute([
        { type: 'executeDataSource', sourceId: 'sourceB', resultTo: 'state.rows' },
      ] as never),
    ]);

    // B 先成功提交、A 后成功覆盖：按成功提交顺序，无跨来源 latest-wins
    expect(state.calls.map((call) => call.sourceId).sort()).toEqual(['sourceA', 'sourceB']);
    expect(session.runtime.getState().rows).toEqual({ items: ['A-committed-last'] });
  });

  it('R8: legacy apiCall is untouched (host api client still drives it)', async () => {
    const apiGet = vi.fn().mockResolvedValue({ legacy: true });
    const session = createRuntimeSession({
      pageId: 'r8-page',
      documentSessionId: 'r8-doc',
      dispatcherInit: {
        state: { rows: [] },
        api: { get: apiGet },
      },
    });
    const batch = (await session.dispatcher.execute([
      { type: 'apiCall', url: '/legacy', resultTo: 'state.rows' },
    ] as never)) as { success: number; results: Array<{ success: boolean }> };

    expect(apiGet).toHaveBeenCalled();
    expect(batch.success).toBe(1);
    expect(batch.results[0].success).toBe(true);
    expect(session.runtime.getState().rows).toEqual({ legacy: true });
  });

  it('X1: renderer path matches the compiler path on the same scripted outcomes', async () => {
    // 与 compiler generator.datasource.spec C4 相同的 outcome 序列与断言语义：
    // 成功整值写入；失败保留旧值且返回结构化结果（含 code/traceId）
    const script = createScriptedService([
      { ok: true, result: { items: [{ id: 'a', title: 'Apple' }] } },
      { ok: false, code: 'TIMEOUT', message: 'deadline exceeded', traceId: 't-1' },
    ]);
    const harness = createDispatcherHarness({ service: script.service });

    const firstBatch = (await executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    })) as { results: Array<{ value?: { success: boolean } }> };
    expect(firstBatch.results[0].value?.success).toBe(true);
    expect(harness.session.runtime.getState().rows).toEqual({
      items: [{ id: 'a', title: 'Apple' }],
    });

    const secondBatch = (await executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    })) as {
      results: Array<{ value?: { success: boolean; code?: string; traceId?: string } }>;
    };
    expect(secondBatch.results[0].value).toMatchObject({
      success: false,
      code: 'TIMEOUT',
      traceId: 't-1',
    });
    expect(harness.session.runtime.getState().rows).toEqual({
      items: [{ id: 'a', title: 'Apple' }],
    });
  });

  it('P2 review: object params are JSON-snapshotted, deep-frozen and isolated from later mutation', async () => {
    const captured: Array<{ params?: Record<string, unknown> }> = [];
    const state = {
      calls: 0,
      service: undefined as never,
    };
    state.service = {
      execute: (input: { sourceId: string; params?: Record<string, unknown> }) =>
        new Promise<DataSourceExecutionOutcome>((resolve) => {
          captured.push({ params: input.params });
          state.calls += 1;
          resolve({ ok: true, result: { items: ['ok'] } });
        }),
    };
    const harness = createDispatcherHarness({
      service: state.service,
      state: { filter: { status: 'active', tags: ['a', 'b'] }, rows: [] },
      declarations: {
        searchItems: {
          operationRef: { operationId: 'demo.items.search', revision: '1' },
          params: { filter: '{{ state.filter }}' },
        },
      },
    });

    await executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    });

    // 嵌套对象/数组完整快照
    expect(captured[0].params).toEqual({ filter: { status: 'active', tags: ['a', 'b'] } });
    // 深冻结：顶层与嵌套对象/数组均不可变
    const params = captured[0].params as { filter: { status: string; tags: string[] } };
    expect(Object.isFrozen(params)).toBe(true);
    expect(Object.isFrozen(params.filter)).toBe(true);
    expect(Object.isFrozen(params.filter.tags)).toBe(true);
    // 隔离：源 state 对象原地变异不影响已捕获快照
    (harness.session.runtime.getState() as { filter: { status: string } }).filter.status =
      'mutated';
    expect(captured[0].params).toEqual({ filter: { status: 'active', tags: ['a', 'b'] } });
  });

  it('P3 review: host method receiver is preserved (class-based adapters keep this)', async () => {
    class BoundAdapter {
      private readonly calls: string[] = [];
      constructor(private readonly pageBinding: string) {}
      async execute(input: { sourceId: string }): Promise<DataSourceExecutionOutcome> {
        // 依赖 this 上的页面绑定配置；若接收者丢失此处即抛错/记录 undefined
        this.calls.push(`${this.pageBinding}:${input.sourceId}`);
        return { ok: true, result: { bound: this.pageBinding } };
      }
      recorded(): string[] {
        return this.calls;
      }
    }
    const adapter = new BoundAdapter('page-42@v7');
    const harness = createDispatcherHarness({
      service: adapter as unknown as ScriptedService['service'],
    });

    const batch = (await executeAction(harness, {
      type: 'executeDataSource',
      sourceId: 'searchItems',
      resultTo: 'state.rows',
    })) as { results: Array<{ value?: { success: boolean } }> };

    expect(adapter.recorded()).toEqual(['page-42@v7:searchItems']);
    expect(batch.results[0].value?.success).toBe(true);
    expect(harness.session.runtime.getState().rows).toEqual({ bound: 'page-42@v7' });
  });

  it('G1: production manifest still blocks mounting data-source schemas (no patch)', () => {
    restoreManifest?.();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <Renderer
            schema={m1bFixture.schema}
            preset={testPreset}
            pageId="g1-page"
            documentSessionId="g1-doc"
          />,
        ),
      ).toThrow(/data-source|CAPABILITY/);
    } finally {
      consoleErrorSpy.mockRestore();
      cleanup();
    }
  });
});
