import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import * as contract from '@lowcode-platform/schema-contract';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { PageRuntimeMetadataProvider } from '../../page-schema/page-runtime-metadata.provider';
import { PageSchemaRepository } from '../../page-schema/repositories/page-schema.repository';
import { DataSourceExecutionService } from '../data-source-execution.service';
import { DataSourceExecutionError } from '../data-source-execution.service';
import { DataSourceExecutor } from '../data-source-executor';
import {
  DataSourceIdentityAdapter,
  type TrustedDataSourceIdentity,
} from '../data-source-identity.adapter';
import {
  LoopbackUpstreamServer,
  route,
  searchBehavior,
  jsonBehavior,
  oversizedBehavior,
  depthBombBehavior,
  persistentStreamBehavior,
  slowBehavior,
  redirectBehavior,
  type UpstreamSearchItem,
} from './helpers/loopback-upstream';

const m1bFixture = require('../../../../../../test-fixtures/m1b-datasource-conformance.json');

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);

/**
 * 可信测试配置：仅在「构造阶段」放行 data-source 能力，把含声明的快照
 * 写入内存中的仓储；生产默认清单本身字节不变。执行期的拒绝测试在真实
 * 清单下进行（除非显式包在 withSupportedDataSourceAsync 内）。
 */
async function withSupportedDataSourceAsync<T>(fn: () => Promise<T>): Promise<T> {
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

class TestIdentityAdapter extends DataSourceIdentityAdapter {
  constructor(private readonly identity: TrustedDataSourceIdentity | undefined) {
    super();
  }
  resolveIdentity(): TrustedDataSourceIdentity | undefined {
    return this.identity;
  }
}

const ALLOWED_IDENTITY: TrustedDataSourceIdentity = {
  userId: 'demo-tester',
  tenantId: 'demo-tenant',
  grantedPermissions: new Set(['data-source:demo.items.search:execute']),
};

const UPSTREAM_ITEMS: UpstreamSearchItem[] = [
  { id: 'item-1', title: 'Apple Pie', price: 12 },
  { id: 'item-2', title: 'Apple Juice', price: 8 },
  { id: 'item-3', title: 'Banana Bread', price: 15 },
  { id: 'item-4', title: 'Crab Apple Jam', price: 22 },
];

interface KernelHarness {
  upstream: LoopbackUpstreamServer;
  service: DataSourceExecutionService;
  repo: PageSchemaRepository;
}

async function createHarness(options?: {
  identity?: TrustedDataSourceIdentity | undefined;
  targets?: Record<string, string>;
  maxInFlightPerPage?: number;
  limitOverrides?: Partial<contract.DataSourceExecutionLimits>;
  handler?: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void;
}): Promise<KernelHarness> {
  const upstream = await LoopbackUpstreamServer.create(
    options?.handler ??
      route({
        '/demo/items/search': (req, res) => searchBehavior(UPSTREAM_ITEMS, req, res),
      }),
  );
  const targets =
    options?.targets === undefined
      ? { 'demo.items.search@1': upstream.url('/demo/items/search') }
      : options.targets;
  const identity = 'identity' in (options ?? {}) ? options?.identity : ALLOWED_IDENTITY;

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'm1b-kernel-'));
  const repo = new PageSchemaRepository();
  (repo as unknown as { storeFilePath: string }).storeFilePath = path.join(tmpDir, 'store.json');
  const service = new DataSourceExecutionService(
    new PageSchemaService(repo, new PageRuntimeMetadataProvider()),
    new TestIdentityAdapter(identity),
    new DataSourceExecutor(),
    targets,
    options?.maxInFlightPerPage ?? 4,
    options?.limitOverrides ?? {},
  );
  return { upstream, service, repo };
}

async function seedPage(harness: KernelHarness, pageId: string, schema: unknown): Promise<number> {
  return withSupportedDataSourceAsync(async () => {
    await harness.repo.onModuleInit();
    const pageService = new PageSchemaService(harness.repo, new PageRuntimeMetadataProvider());
    const saved = await pageService.saveSchema({ pageId, schema });
    return saved.pageVersion;
  });
}

function variantSchema(mutate: (schema: Record<string, unknown>) => void): unknown {
  const schema = JSON.parse(JSON.stringify(m1bFixture.schema)) as Record<string, unknown>;
  mutate(schema);
  return schema;
}

async function captureError(fn: () => Promise<unknown>): Promise<DataSourceExecutionError> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DataSourceExecutionError);
    return error as DataSourceExecutionError;
  }
  throw new Error('expected execute() to reject');
}

function expectSanitizedMessage(message: string): void {
  expect(message).not.toMatch(/127\.0\.0\.1/);
  expect(message).not.toMatch(/localhost/);
  expect(message).not.toMatch(/http:/);
}

describe('DataSource trusted execution kernel (M1b-1 PR B / Refs #64)', () => {
  let harnesses: KernelHarness[];

  beforeEach(() => {
    harnesses = [];
    (
      PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
    ).writeTails?.clear?.();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    (
      PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
    ).writeTails?.clear?.();
    for (const harness of harnesses) {
      await harness.upstream.stop().catch(() => undefined);
    }
  });

  function track(harness: KernelHarness): KernelHarness {
    harnesses.push(harness);
    return harness;
  }

  describe('1. 真实成功链（受控 loopback 上游）', () => {
    it('executes the declared operation with evaluated params and returns the validated result', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-ok', m1bFixture.schema);

      const outcome = await withSupportedDataSourceAsync(() =>
        harness.service.execute({
          pageId: 'kernel-ok',
          pageVersion: version,
          sourceId: 'searchItems',
          params: { query: 'apple', limit: 2 },
        }),
      );

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result).toEqual({
          items: [
            { id: 'item-1', title: 'Apple Pie', price: 12 },
            { id: 'item-2', title: 'Apple Juice', price: 8 },
          ],
        });
        expect(outcome.operationId).toBe('demo.items.search');
        expect(outcome.revision).toBe('1');
        expect(typeof outcome.traceId).toBe('string');
        expect(outcome.traceId.length).toBeGreaterThan(0);
      }
      // 真实上游被调用一次，查询串携带已求值参数
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
      const requestUrl = harness.upstream.requestUrl(0) ?? '';
      expect(requestUrl).toContain('query=apple');
      expect(requestUrl).toContain('limit=2');
    });

    it('omitting params executes with an empty query', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-no-params', m1bFixture.schema);

      const outcome = await withSupportedDataSourceAsync(() =>
        harness.service.execute({
          pageId: 'kernel-no-params',
          pageVersion: version,
          sourceId: 'searchItems',
        }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        const result = outcome.result as { items: unknown[] };
        expect(result.items).toHaveLength(4);
      }
      expect(harness.upstream.totalRequests()).toBe(1);
    });
  });

  describe('2. 前置拒绝：上游计数必须为 0', () => {
    it('rejects unknown operationId with UNKNOWN_OPERATION', async () => {
      const harness = track(await createHarness());
      const schema = variantSchema((s) => {
        (
          s as { logic: { dataSources: Record<string, { operationRef: { operationId: string } }> } }
        ).logic.dataSources.searchItems.operationRef.operationId = 'demo.items.unknown';
      });
      const version = await seedPage(harness, 'kernel-unknown-op', schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-unknown-op',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('UNKNOWN_OPERATION');
      expect(error.getStatus()).toBe(404);
      expectSanitizedMessage(error.message);
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects unknown revision with UNKNOWN_OPERATION (exact-pair matching)', async () => {
      const harness = track(await createHarness());
      const schema = variantSchema((s) => {
        (
          s as { logic: { dataSources: Record<string, { operationRef: { revision: string } }> } }
        ).logic.dataSources.searchItems.operationRef.revision = '999';
      });
      const version = await seedPage(harness, 'kernel-unknown-rev', schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-unknown-rev',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('UNKNOWN_OPERATION');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects with CAPABILITY_DENIED under the real production manifest', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-capability', m1bFixture.schema);

      // 构造期放行写入快照；执行期使用真实生产清单（data-source unsupported）
      const error = await captureError(() =>
        harness.service.execute({
          pageId: 'kernel-capability',
          pageVersion: version,
          sourceId: 'searchItems',
        }),
      );
      expect(error.code).toBe('CAPABILITY_DENIED');
      expect(error.getStatus()).toBe(403);
      expect(error.message).toContain('data-source');
      expectSanitizedMessage(error.message);
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects deterministically without an identity adapter (default fail-close)', async () => {
      const harness = track(await createHarness({ identity: undefined }));
      const version = await seedPage(harness, 'kernel-no-identity', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-no-identity',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('FORBIDDEN');
      expect(error.getStatus()).toBe(403);
      expect(error.message).toContain('identity');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects an identity without the required permission', async () => {
      const harness = track(
        await createHarness({
          identity: {
            userId: 'someone',
            tenantId: 'other-tenant',
            grantedPermissions: new Set(['something:else']),
          },
        }),
      );
      const version = await seedPage(harness, 'kernel-no-perm', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-no-perm',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('not permitted');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects when the deployment configures no upstream target', async () => {
      const harness = track(await createHarness({ targets: {} }));
      const version = await seedPage(harness, 'kernel-no-target', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-no-target',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('target is not configured');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects a non-loopback target binding for the loopback-only demo operation', async () => {
      const harness = track(
        await createHarness({
          targets: { 'demo.items.search@1': 'http://10.1.2.3/demo/items/search' },
        }),
      );
      const version = await seedPage(harness, 'kernel-public-target', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-public-target',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('FORBIDDEN');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects a sourceId not declared in the bound snapshot', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-bad-source', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-bad-source',
            pageVersion: version,
            sourceId: 'notDeclared',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_PARAMS');
      expect(error.message).toContain('not declared');
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects missing page / pageVersion with 404 before any upstream call', async () => {
      const harness = track(await createHarness());
      await seedPage(harness, 'kernel-404', m1bFixture.schema);

      await withSupportedDataSourceAsync(async () => {
        await expect(
          harness.service.execute({
            pageId: 'missing-page',
            pageVersion: 1,
            sourceId: 'searchItems',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          harness.service.execute({
            pageId: 'kernel-404',
            pageVersion: 99,
            sourceId: 'searchItems',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects request-shape violations with INVALID_PARAMS', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-shape', m1bFixture.schema);

      const cases: unknown[] = [
        { pageId: 'kernel-shape', pageVersion: version, sourceId: 'searchItems', url: 'http://x' },
        { pageId: 'kernel-shape', pageVersion: version, sourceId: 'searchItems', params: 'str' },
        { pageId: 'kernel-shape', pageVersion: version, sourceId: 'searchItems', params: [1] },
        {
          pageId: 'kernel-shape',
          pageVersion: version,
          sourceId: 'searchItems',
          params: { 'bad-key': 1 },
        },
        { pageId: 'kernel-shape', pageVersion: 1.5, sourceId: 'searchItems' },
        null,
      ];

      await withSupportedDataSourceAsync(async () => {
        for (const request of cases) {
          const error = await captureError(() => harness.service.execute(request));
          expect(error.code).toBe('INVALID_PARAMS');
          expect(error.getStatus()).toBe(400);
          expectSanitizedMessage(error.message);
        }
      });
      expect(harness.upstream.totalRequests()).toBe(0);
    });

    it('rejects params that violate the operation input contract (scope keys cannot be smuggled)', async () => {
      const harness = track(await createHarness());
      const version = await seedPage(harness, 'kernel-contract', m1bFixture.schema);

      const badParamsList: Record<string, unknown>[] = [
        { tenantId: 'attacker-tenant' },
        { url: 'http://evil.example.com' },
        { query: 123 },
        { query: 'a'.repeat(129) },
        { limit: 0 },
        { limit: 51 },
        { limit: 2.5 },
      ];

      await withSupportedDataSourceAsync(async () => {
        for (const params of badParamsList) {
          const error = await captureError(() =>
            harness.service.execute({
              pageId: 'kernel-contract',
              pageVersion: version,
              sourceId: 'searchItems',
              params,
            }),
          );
          expect(error.code).toBe('INVALID_PARAMS');
          expect(error.message).toContain('input contract');
        }
      });
      expect(harness.upstream.totalRequests()).toBe(0);
    });
  });

  describe('3. 并发准入', () => {
    it('rejects a second concurrent execution on the same page with EXECUTION_BUSY and zero extra upstream calls', async () => {
      const harness = track(
        await createHarness({
          maxInFlightPerPage: 1,
          handler: route({
            '/demo/items/search': slowBehavior(250, (req, res) =>
              searchBehavior(UPSTREAM_ITEMS, req, res),
            ),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-busy', m1bFixture.schema);

      await withSupportedDataSourceAsync(async () => {
        const first = harness.service.execute({
          pageId: 'kernel-busy',
          pageVersion: version,
          sourceId: 'searchItems',
        });
        // 让首个请求真正占用上游窗口
        await new Promise((resolve) => setTimeout(resolve, 50));

        const error = await captureError(() =>
          harness.service.execute({
            pageId: 'kernel-busy',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        );
        expect(error.code).toBe('EXECUTION_BUSY');
        expect(error.getStatus()).toBe(429);
        expectSanitizedMessage(error.message);

        const firstOutcome = await first;
        expect(firstOutcome.ok).toBe(true);
      });
      // 第二个请求零上游调用；只有第一个请求到达上游
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it('admits a different page while one is in flight (per-page scoping)', async () => {
      const harness = track(
        await createHarness({
          maxInFlightPerPage: 1,
          handler: route({
            '/demo/items/search': slowBehavior(150, (req, res) =>
              searchBehavior(UPSTREAM_ITEMS, req, res),
            ),
          }),
        }),
      );
      const v1 = await seedPage(harness, 'kernel-page-a', m1bFixture.schema);
      const v2 = await seedPage(harness, 'kernel-page-b', m1bFixture.schema);

      await withSupportedDataSourceAsync(async () => {
        const first = harness.service.execute({
          pageId: 'kernel-page-a',
          pageVersion: v1,
          sourceId: 'searchItems',
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const second = await harness.service.execute({
          pageId: 'kernel-page-b',
          pageVersion: v2,
          sourceId: 'searchItems',
        });
        expect(second.ok).toBe(true);
        expect((await first).ok).toBe(true);
      });
      expect(harness.upstream.countFor('/demo/items/search')).toBe(2);
    });

    it('releases the slot after a failed execution', async () => {
      const harness = track(
        await createHarness({
          maxInFlightPerPage: 1,
          handler: route({
            '/demo/items/search': jsonBehavior(500, { error: 'boom' }),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-release', m1bFixture.schema);

      await withSupportedDataSourceAsync(async () => {
        const first = await captureError(() =>
          harness.service.execute({
            pageId: 'kernel-release',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        );
        expect(first.code).toBe('UPSTREAM_FAILURE');

        // 槽位已释放：第二次同样到达上游（再失败）
        const second = await captureError(() =>
          harness.service.execute({
            pageId: 'kernel-release',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        );
        expect(second.code).toBe('UPSTREAM_FAILURE');
      });
      expect(harness.upstream.countFor('/demo/items/search')).toBe(2);
    });
  });

  describe('4. 上游已响应后的拒绝（请求确实发生，不宣称零调用）', () => {
    it('terminates an oversized response during streaming and rejects with INVALID_RESULT', async () => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': (req, res) =>
              oversizedBehavior(2 * 1024 * 1024, 64 * 1024, req, res),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-oversize', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-oversize',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.getStatus()).toBe(502);
      expect(error.message).toContain('exceeded limit of');
      expectSanitizedMessage(error.message);
      // 请求已发生（不可宣称零调用），且服务端观察到响应未写完即被中止
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(harness.upstream.prematureClosesFor('/demo/items/search')).toBe(1);
    });

    it('terminates a depth bomb during streaming (pre-parse guard)', async () => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': depthBombBehavior(50_000),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-depth', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-depth',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toContain('nesting depth');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it('destroys the upstream connection after a depth violation on a never-ending stream (review P1)', async () => {
      // 上游持续写入、永不结束：错误返回后连接必须被中止，
      // 而不是留着上游继续写入已判定违规的响应
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': persistentStreamBehavior('['.repeat(512)),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-depth-live', m1bFixture.schema);

      const startedAt = Date.now();
      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-depth-live',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toContain('nesting depth');
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);

      // 服务端观测：响应未写完即被客户端中止（连接确实关闭）
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(harness.upstream.prematureClosesFor('/demo/items/search')).toBe(1);
    });

    it('never leaks upstream-controlled field names in the output-contract message (review P2)', async () => {
      // 上游返回带敏感命名未知字段的结果：客户端只收固定安全消息
      const sensitiveField = 'internalCallbackUrlWithToken';
      const sensitiveValue = 'http://10.9.8.7/secret?token=xyz';
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': jsonBehavior(200, {
              items: [],
              [sensitiveField]: sensitiveValue,
            }),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-leak', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-leak',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toBe('Upstream result does not match the operation output contract');
      expect(error.message).not.toContain(sensitiveField);
      expect(error.message).not.toContain(sensitiveValue);
      expect(error.message).not.toContain('10.9.8.7');
      expect(error.message).not.toContain('token');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it('rejects invalid JSON with INVALID_RESULT', async () => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': jsonBehavior(200, 'not-json{{'),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-badjson', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-badjson',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toContain('not valid JSON');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it.each([
      ['非对象结果', '"plain-string"'],
      ['items 非数组', { items: 'nope' }],
      ['结果含未知字段', { items: [], extra: 1 }],
      ['条目字段未知', { items: [{ id: 'a', title: 't', weight: 3 }] }],
      ['条目 id 缺失', { items: [{ title: 't' }] }],
      ['超记录数', { items: Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, title: 't' })) }],
    ])('rejects output contract violations: %s', async (_label, body) => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': jsonBehavior(200, body),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-shape-out', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-shape-out',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toContain('output contract');
      expectSanitizedMessage(error.message);
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it('rejects upstream HTTP 5xx with UPSTREAM_FAILURE', async () => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': jsonBehavior(500, { error: 'internal' }),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-5xx', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-5xx',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('UPSTREAM_FAILURE');
      expect(error.getStatus()).toBe(502);
      expect(error.message).not.toContain('500');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });

    it('does not follow redirects (target constraint bypass attempt)', async () => {
      const harness = track(
        await createHarness({
          handler: route({
            '/demo/items/search': redirectBehavior('/elsewhere'),
            '/elsewhere': (req, res) => searchBehavior(UPSTREAM_ITEMS, req, res),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-redirect', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-redirect',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('UPSTREAM_FAILURE');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
      // 重定向目标从未被请求
      expect(harness.upstream.countFor('/elsewhere')).toBe(0);
    });

    it('rejects with TIMEOUT when the server-side deadline elapses', async () => {
      const harness = track(
        await createHarness({
          limitOverrides: { deadlineMs: 150 },
          handler: route({
            '/demo/items/search': slowBehavior(800, (req, res) =>
              searchBehavior(UPSTREAM_ITEMS, req, res),
            ),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-timeout', m1bFixture.schema);

      const startedAt = Date.now();
      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-timeout',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('TIMEOUT');
      expect(error.getStatus()).toBe(504);
      expect(error.message).toContain('deadline');
      expect(Date.now() - startedAt).toBeLessThan(1000);
      // 超时请求已发出（不宣称零调用），且响应未完成即被中止
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(harness.upstream.prematureClosesFor('/demo/items/search')).toBe(1);
    });

    it('rejects transport failure (connection refused) with UPSTREAM_FAILURE', async () => {
      const tempServer = await LoopbackUpstreamServer.create(
        route({ '/demo/items/search': (req, res) => searchBehavior(UPSTREAM_ITEMS, req, res) }),
      );
      const deadUrl = tempServer.url('/demo/items/search');
      await tempServer.stop();

      const harness = track(await createHarness({ targets: { 'demo.items.search@1': deadUrl } }));
      const version = await seedPage(harness, 'kernel-refused', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-refused',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('UPSTREAM_FAILURE');
      expectSanitizedMessage(error.message);
    });
  });

  describe('5. 限额覆盖只能下调', () => {
    it('rejects invalid limit override construction (fail-close at boot)', () => {
      expect(
        () =>
          new DataSourceExecutionService(
            {} as never,
            new TestIdentityAdapter(ALLOWED_IDENTITY),
            new DataSourceExecutor(),
            {},
            4,
            { deadlineMs: 0 },
          ),
      ).toThrow(TypeError);
      expect(
        () =>
          new DataSourceExecutionService(
            {} as never,
            new TestIdentityAdapter(ALLOWED_IDENTITY),
            new DataSourceExecutor(),
            {},
            4,
            { maxResponseBytes: 1.5 },
          ),
      ).toThrow(TypeError);
    });

    it('a downward byte override takes effect during streaming', async () => {
      const harness = track(
        await createHarness({
          limitOverrides: { maxResponseBytes: 8 * 1024 },
          handler: route({
            '/demo/items/search': (req, res) => oversizedBehavior(64 * 1024, 4 * 1024, req, res),
          }),
        }),
      );
      const version = await seedPage(harness, 'kernel-override', m1bFixture.schema);

      const error = await withSupportedDataSourceAsync(() =>
        captureError(() =>
          harness.service.execute({
            pageId: 'kernel-override',
            pageVersion: version,
            sourceId: 'searchItems',
          }),
        ),
      );
      expect(error.code).toBe('INVALID_RESULT');
      expect(error.message).toContain('exceeded limit of 8192');
      expect(harness.upstream.countFor('/demo/items/search')).toBe(1);
    });
  });
});
