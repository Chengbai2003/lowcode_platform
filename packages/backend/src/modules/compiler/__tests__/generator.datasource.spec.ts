import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as contract from '@lowcode-platform/schema-contract';
import { compileToCode } from '../generator';
import { parseSchema, transform, generate } from '../pipeline';
import type { PageSchema } from '@lowcode-platform/schema-contract';
// 双 Preset 绑定（计划 §6：两 Preset 均覆盖，不硬编码组件库）
import { antdCompilerBindings } from '@lowcode-platform/preset-antd';
import { testCompilerBindings } from '@lowcode-platform/preset-test';

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
) as { schema: PageSchema; flowSchema: PageSchema; legacyApiCallSchema: PageSchema };

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);

async function withSupportedDataSourceAsync<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of contract.CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  policyModule.getTrustedExecutionPolicy = () => 'operation-only';
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  }
}

function compileFixtureAsync(schema: PageSchema): Promise<string> {
  return withSupportedDataSourceAsync(() =>
    compileToCode(schema as unknown as Record<string, unknown>),
  );
}

/** 提取生成组件主体（兼容 dataSources prop 新签名与旧签名） */
function extractGeneratedComponentBody(code: string): string {
  const markers = [
    'export default function GeneratedPage({ dataSources } = {}) {\n',
    'export default function GeneratedPage() {\n',
  ];
  const end = code.lastIndexOf('\n  return ');
  for (const marker of markers) {
    const start = code.indexOf(marker);
    if (start >= 0 && end > start) {
      return code
        .slice(start + marker.length, end)
        .replace(/^  /gm, '')
        .trim();
    }
  }
  throw new Error('GeneratedPage body not found');
}

function extractClickHandlerNames(code: string): string[] {
  return Array.from(code.matchAll(/const (handle\w+Click) =/g)).map((m) => m[1]);
}

interface ScriptedDataSourceService {
  service: {
    execute: (
      input: { sourceId: string; params?: unknown },
      signal?: AbortSignal,
    ) => Promise<unknown>;
  };
  calls: Array<{ sourceId: string; params: unknown }>;
  aborts: number;
}

/** 脚本化宿主服务：按序返回 outcome，并观测 abort */
function createScriptedDataSourceService(
  outcomes: Array<
    { ok: true; result: unknown } | { ok: false; code: string; message: string; traceId?: string }
  >,
  options?: { delayMs?: number },
): ScriptedDataSourceService {
  const state: ScriptedDataSourceService = {
    calls: [],
    aborts: 0,
    service: undefined as never,
  };
  let index = 0;
  state.service = {
    execute: (input: { sourceId: string; params?: unknown }, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
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
          resolve(outcome);
        }, options?.delayMs ?? 0);
      }),
  };
  return state;
}

function createDataSourceHarness(
  code: string,
  dataSources: unknown,
  returnedCode: string,
): { value: Record<string, unknown>; getState: () => unknown; unmount: () => void } {
  let renderedState: unknown;
  let unmountCleanup: (() => void) | undefined;
  const useState = (initialState: unknown) => {
    renderedState = initialState;
    return [
      initialState,
      (update: unknown) => {
        renderedState =
          typeof update === 'function'
            ? (update as (state: unknown) => unknown)(renderedState)
            : update;
      },
    ];
  };
  const useMemo = (factory: () => unknown) => factory();
  const useRef = <T>(value: T) => ({ current: value });
  const useEffect = (effect: () => void | (() => void) | undefined) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      unmountCleanup = cleanup;
    }
  };
  const noop = () => undefined;
  const message = { info: noop, success: noop, warning: noop, error: noop };
  const notification = { info: noop, success: noop, warning: noop, error: noop };
  const Modal = { confirm: () => ({ destroy: noop }), info: () => ({ destroy: noop }) };

  const factory = new Function(
    'useState',
    'useMemo',
    'useRef',
    'useEffect',
    'dataSources',
    'message',
    'notification',
    'Modal',
    'window',
    `${extractGeneratedComponentBody(code)}\nreturn ${returnedCode};`,
  );
  const value = factory(
    useState,
    useMemo,
    useRef,
    useEffect,
    dataSources,
    message,
    notification,
    Modal,
    { location: { href: '' } },
  ) as Record<string, unknown>;
  return {
    value,
    getState: () => renderedState,
    unmount: () => unmountCleanup?.(),
  };
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 手动 resolve 的宿主服务：精确控制穿插时序（P1 复现） */
function createManualService(): {
  service: {
    execute: (
      input: { sourceId: string; params?: unknown },
      signal?: AbortSignal,
    ) => Promise<unknown>;
  };
  calls: Array<{ sourceId: string; params?: unknown }>;
  resolveAt: (index: number, outcome: unknown) => void;
} {
  const resolvers: Array<(value: unknown) => void> = [];
  const calls: Array<{ sourceId: string; params?: unknown }> = [];
  return {
    calls,
    resolveAt: (index, outcome) => resolvers[index](outcome),
    service: {
      execute: (input) =>
        new Promise((resolve) => {
          calls.push({ sourceId: input.sourceId, params: input.params });
          resolvers.push(resolve);
        }),
    },
  };
}

/** 本地单步 Flow schema（P1 Flow 路径穿插复现） */
function buildSingleStepFlowSchema(): Record<string, unknown> {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
    logic: {
      states: { rows: [] },
      dataSources: {
        searchItems: { operationRef: { operationId: 'demo.items.search', revision: '1' } },
      },
      flows: {
        singleFlow: {
          steps: [{ type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' }],
        },
      },
    },
  };
}

/** preset-test 绑定变体：Container 根 + Text 探针（其运行时无 Page/Span） */
function buildPresetTestVariantSchema(): Record<string, unknown> {
  const variant = JSON.parse(JSON.stringify(m1bFixture.schema)) as Record<string, unknown>;
  const components = variant.components as Record<string, Record<string, unknown>>;
  components.root.type = 'Container';
  return variant;
}

/** 本地对象参数 schema（P2 快照：嵌套对象 + 数组） */
function buildObjectParamsSchema(): Record<string, unknown> {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'go' },
        events: {
          onClick: [{ type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' }],
        },
      },
    },
    logic: {
      states: { filter: { status: 'active', tags: ['a', 'b'] }, rows: [] },
      dataSources: {
        searchItems: {
          operationRef: { operationId: 'demo.items.search', revision: '1' },
          params: { filter: '{{ state.filter }}' },
        },
      },
    },
  };
}
void buildSingleStepFlowSchema;
void buildObjectParamsSchema;

describe('compiler executeDataSource generation (M1b-1 PR C / Refs #64)', () => {
  describe('C1: 普通事件路径代码生成', () => {
    it('generates host-service call with evaluated params, result write and no network fallback', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);

      // 组件签名带可选宿主 prop；声明参数按现有表达式语义求值（state.query）
      expect(code).toContain('export default function GeneratedPage({ dataSources } = {}) {');
      expect(code).toContain('__executeDataSource("searchItems", { query: state.query })');
      // 结果经 OnResult 处理器整值提交到已声明 state 槽位
      expect(code).toMatch(/\.then\(handleSearchBtnClickOnResult\)/);
      expect(code).toContain('rows: dsResult.outcome.result');
      // 绝不出现网络回退（宿主服务是唯一出口）
      expect(code).not.toContain('fetch(');
      // 代际运行时：useRef 注册表 + 卸载中止
      expect(code).toContain('const __dataSourceRuns = useRef(new Map());');
      expect(code).toContain('runs.get(sourceId)?.abort()');
    });

    it('keeps the legacy no-prop signature for pages without data source actions', async () => {
      // legacy apiCall 页在生产默认（legacy 策略 + 生产清单）下合法；
      // 不进入测试矩阵 + operation-only 窗口（该窗口下纯 apiCall 页会被策略拒绝）
      const code = await compileToCode(
        m1bFixture.legacyApiCallSchema as unknown as Record<string, unknown>,
      );
      expect(code).toContain('export default function GeneratedPage() {');
      expect(code).not.toContain('__executeDataSource');
    });
  });

  describe('C2: Flow 路径代码生成（含声明集穿透修复）', () => {
    it('wraps host calls in executeWithAbortRace with flow signal and fail-close error mapping', async () => {
      const code = await compileFixtureAsync(m1bFixture.flowSchema);
      // if.then 与 loop.actions 两处嵌套都生成宿主调用
      const callMatches = code.match(/__executeDataSource\("searchItems"/g) ?? [];
      expect(callMatches.length).toBe(2);
      expect(code).toContain('flowContext.executeWithAbortRace(\n');
      expect(code).toContain(
        '__executeDataSource("searchItems", { query: state.query }, flowContext.signal)',
      );
      // 取消 → 不可恢复 abort；失败 → FLOW_STEP_FAILED 携带 B 错误码/traceId
      expect(code).toContain('.superseded) {\n              throw flowContext.createAbortError(');
      expect(code).toContain("'executeDataSource failed [' + outcome.code + ']'");
      expect(code).toContain("outcome.traceId ? ' (trace ' + outcome.traceId + ')'");
      expect(code).not.toContain('fetch(');
    });
  });

  describe('C3: 未知动作编译期 fail-close', () => {
    it('throws when an action type unknown to the compiler reaches the normal path', () =>
      withSupportedDataSourceAsync(() => {
        const ast = parseSchema(m1bFixture.schema);
        // buildComponentTree 会克隆动作；fail-close 必须发生在真正消费的树节点上
        const findEventNode = (
          node: (typeof ast.children)[number],
        ): { events: Array<{ actions: Array<{ type: string }> }> } | undefined => {
          if (node.kind === 'component' && node.events.length > 0) {
            return node as unknown as { events: Array<{ actions: Array<{ type: string }> }> };
          }
          for (const child of 'children' in node ? node.children : []) {
            const found = findEventNode(child);
            if (found) return found;
          }
          return undefined;
        };
        const buttonNode = ast.children.map(findEventNode).find(Boolean);
        expect(buttonNode).toBeDefined();
        (buttonNode!.events[0].actions[0] as { type: string }).type = 'mysteryAction';
        expect(() => transform(ast)).toThrow('Unsupported action type for compiler: mysteryAction');
      }));

    it('flow path already fails closed for unknown action types (regression)', () =>
      withSupportedDataSourceAsync(() => {
        const ast = parseSchema(m1bFixture.flowSchema);
        const flow = ast.flows![0];
        (flow.steps[0] as unknown as { type: string }).type = 'mysteryAction';
        transform(ast);
        const code = generate(ast);
        expect(code).toContain('Unsupported flow action type');
      }));
  });

  describe('C4: 生成代码真实执行（new Function harness + 脚本化宿主服务）', () => {
    it('normal path: success commits the whole result; failure keeps the old value', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);
      const [clickHandler] = extractClickHandlerNames(code);
      expect(clickHandler).toBe('handleSearchBtnClick');
      const script = createScriptedDataSourceService([
        { ok: true, result: { items: [{ id: 'a', title: 'Apple' }] } },
        { ok: false, code: 'TIMEOUT', message: 'deadline exceeded', traceId: 't-1' },
      ]);

      const harness = createDataSourceHarness(code, script.service, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      handler({});
      await tick(20);
      expect(script.calls).toHaveLength(1);
      expect(script.calls[0]).toEqual({ sourceId: 'searchItems', params: { query: '' } });
      // 整值写入：rows 即完整公开结果
      expect((harness.getState() as { rows: unknown }).rows).toEqual({
        items: [{ id: 'a', title: 'Apple' }],
      });

      // 失败：保留旧值，不抛出到调用方（console.error 分支）
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        handler({});
        await tick(20);
      } finally {
        errorSpy.mockRestore();
      }
      expect(script.calls).toHaveLength(2);
      expect((harness.getState() as { rows: unknown }).rows).toEqual({
        items: [{ id: 'a', title: 'Apple' }],
      });
    });

    it('latest-started-wins: a second run supersedes the first (old result discarded, aborted)', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);
      const [clickHandler] = extractClickHandlerNames(code);
      const script = createScriptedDataSourceService(
        [
          { ok: true, result: { items: ['slow-first'] } },
          { ok: true, result: { items: ['fast-second'] } },
        ],
        { delayMs: 80 },
      );
      const harness = createDataSourceHarness(code, script.service, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      handler({});
      await tick(5);
      handler({});
      await tick(150);

      // 旧代际被中止，迟到结果被丢弃；只有第二次结果提交
      expect(script.aborts).toBe(1);
      expect(script.calls).toHaveLength(2);
      expect((harness.getState() as { rows: unknown }).rows).toEqual({ items: ['fast-second'] });
    });

    it('unmount cleanup aborts in-flight runs', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);
      const [clickHandler] = extractClickHandlerNames(code);
      const script = createScriptedDataSourceService([{ ok: true, result: { items: [] } }], {
        delayMs: 200,
      });
      const harness = createDataSourceHarness(code, script.service, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      handler({});
      await tick(10);
      harness.unmount();
      await tick(10);
      expect(script.aborts).toBe(1);
      await tick(220);
    });

    it('flow path: failure maps to FLOW_STEP_FAILED with code/traceId and onError runs', async () => {
      const code = await compileFixtureAsync(m1bFixture.flowSchema);
      const script = createScriptedDataSourceService([
        { ok: false, code: 'TIMEOUT', message: 'deadline exceeded', traceId: 'trace-9' },
      ]);
      const logBuffer: string[] = [];
      const logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logBuffer.push(String(args[0] ?? ''));
      });
      let harness: ReturnType<typeof createDataSourceHarness>;
      try {
        harness = createDataSourceHarness(code, script.service, '{ executeFlow }');
        const executeFlow = harness.value.executeFlow as (flow: string) => Promise<unknown>;
        // fixture 的 searchFlow 带 onError：失败被恢复，结果为 recovered
        await expect(executeFlow('searchFlow')).resolves.toMatchObject({
          status: 'recovered',
          recovered: true,
          error: {
            name: 'FlowExecutionError',
            code: 'FLOW_STEP_FAILED',
            message: expect.stringContaining('executeDataSource failed [TIMEOUT] (trace trace-9)'),
          },
        });
        // Flow 级 onError（log 动作）执行过
        expect(logBuffer.join('\n')).toContain('search failed');
      } finally {
        logSpy.mockRestore();
      }
      expect(script.calls.length).toBeGreaterThan(0);
      // 失败保留旧值
      expect((harness!.getState() as { rows: unknown[] }).rows).toEqual([]);
    });
  });

  describe('C5: 生成产物缺宿主服务', () => {
    it('fails closed at runtime without any network fallback', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);
      const [clickHandler] = extractClickHandlerNames(code);
      // 不注入 dataSources（undefined）
      const harness = createDataSourceHarness(code, undefined, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;
      const logged: unknown[][] = [];
      const errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
      try {
        handler({});
        await tick(20);
      } finally {
        errorSpy.mockRestore();
      }
      // mockRestore 会清空调用记录，断言基于 spy 内收集的日志
      expect(logged.length).toBeGreaterThan(0);
      expect(logged[0][0]).toBe('executeDataSource failed:');
      expect((logged[0][1] as Error).message).toContain('dataSources');
      // 旧值保留
      expect((harness.getState() as { rows: unknown[] }).rows).toEqual([]);
    });
  });

  describe('双 Preset 编译绑定（计划 §6）', () => {
    it.each([
      ['builtin-antd', antdCompilerBindings, m1bFixture.schema],
      // preset-test 运行时仅 Container/Text/Button：用 Container 根的同构变体
      ['preset-test', testCompilerBindings, buildPresetTestVariantSchema()],
    ])(
      '%s bindings: executeDataSource codegen is preset-independent (host call, no network fallback)',
      async (_label, bindings, schema) => {
        const code = await withSupportedDataSourceAsync(() =>
          compileToCode(schema as unknown as Record<string, unknown>, {
            componentBindings: bindings.componentBindings as never,
            componentSources: bindings.componentSources as never,
            defaultLibrary: bindings.defaultLibrary,
            allowDefaultComponentFallback: bindings.allowDefaultComponentFallback,
          }),
        );
        // 宿主调用与数据源运行时不依赖组件库；组件 import 按绑定解析
        expect(code).toContain('__executeDataSource("searchItems", { query: state.query })');
        expect(code).toContain('const __dataSourceRuns = useRef(new Map());');
        expect(code).not.toContain('fetch(');
        // 组件 import 确按对应绑定解析（不硬编码组件库）
        expect(code).toContain(
          bindings === testCompilerBindings
            ? '@lowcode-platform/preset-test/runtime'
            : '@lowcode-platform/preset-antd/runtime',
        );
      },
    );
  });

  describe('审查修正 round 1', () => {
    it('P1 普通路径：守卫覆盖实际写入点——旧结果在写入前被新代际穿透时丢弃', async () => {
      const code = await compileFixtureAsync(m1bFixture.schema);
      const [clickHandler] = extractClickHandlerNames(code);
      const manual = createManualService();
      const harness = createDataSourceHarness(code, manual.service, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      handler({});
      manual.resolveAt(0, { ok: true, result: { items: ['stale-A'] } });
      // 恰好一个微任务：helper 内部 wrap 已执行、OnResult 已排队但尚未写
      await Promise.resolve();
      // 在写入前启动第二次请求（未完成）：旧代际必须被穿透丢弃
      handler({});
      await tick(20);
      expect(harness.getState()).toMatchObject({ rows: [] });

      manual.resolveAt(1, { ok: true, result: { items: ['B'] } });
      await tick(20);
      expect(harness.getState()).toMatchObject({ rows: { items: ['B'] } });
    });

    it('P1 Flow 路径：同样的穿插下旧代际以不可恢复取消结束且不写入', async () => {
      const code = await compileFixtureAsync(buildSingleStepFlowSchema() as unknown as PageSchema);
      const manual = createManualService();
      const harness = createDataSourceHarness(code, manual.service, '{ executeFlow }');
      const executeFlow = harness.value.executeFlow as (flow: string) => Promise<unknown>;

      const runA = executeFlow('singleFlow');
      manual.resolveAt(0, { ok: true, result: { items: ['stale-A'] } });
      await Promise.resolve();
      const runB = executeFlow('singleFlow'); // 第二次（未完成）
      const aError = ((await runA.catch((error: unknown) => error)) as { code?: string }).code;

      expect(aError).toBe('FLOW_ABORTED');
      expect(harness.getState()).toMatchObject({ rows: [] });

      manual.resolveAt(1, { ok: true, result: { items: ['B'] } });
      await runB;
      expect(harness.getState()).toMatchObject({ rows: { items: ['B'] } });
    });

    it('P2 生成代码：对象参数 JSON 快照（深拷贝 + 深冻结，源对象与宿主均不可变更）', async () => {
      const code = await compileFixtureAsync(buildObjectParamsSchema() as unknown as PageSchema);
      const [clickHandler] = extractClickHandlerNames(code);
      const manual = createManualService();
      const harness = createDataSourceHarness(code, manual.service, `{ ${clickHandler} }`);
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      handler({});
      await tick(20);
      const captured = manual.calls[0].params as { filter: { status: string; tags: string[] } };
      expect(captured).toEqual({ filter: { status: 'active', tags: ['a', 'b'] } });

      // 深拷贝：与源 state 对象非同一引用；源对象原地变异不影响已捕获快照
      const rendered = harness.getState() as { filter: { status: string; tags: string[] } };
      expect(captured.filter).not.toBe(rendered.filter);
      rendered.filter.status = 'mutated';
      rendered.filter.tags.push('x');
      expect(captured).toEqual({ filter: { status: 'active', tags: ['a', 'b'] } });

      // 深冻结（review round 2）：与 Renderer 一致，宿主拿到的快照逐层不可变
      expect(Object.isFrozen(captured)).toBe(true);
      expect(Object.isFrozen(captured.filter)).toBe(true);
      expect(Object.isFrozen(captured.filter.tags)).toBe(true);
      try {
        captured.filter.status = 'host-mutation';
        captured.filter.tags.push('host-mutation');
      } catch {
        // strict 模式抛错同样证明不可变
      }
      expect(captured).toEqual({ filter: { status: 'active', tags: ['a', 'b'] } });
    });
  });

  describe('G1: 能力门禁不退化（生产清单）', () => {
    it('still rejects data-source schemas at compile under the production manifest', () => {
      expect(() => compileToCode(m1bFixture.schema as unknown as Record<string, unknown>)).toThrow(
        /data-source|CAPABILITY/,
      );
    });
  });
});
