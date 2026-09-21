import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { ConfigModule } from '@nestjs/config';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { DataSourceModule } from '../data-source.module';
import { DataSourceCatalogService } from '../data-source-catalog.service';
import {
  DataSourceIdentityAdapter,
  TrustedDataSourceIdentity,
} from '../data-source-identity.adapter';
import { DATA_SOURCE_UPSTREAM_TARGETS } from '../upstream-targets.provider';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { LoopbackUpstreamServer, route, searchBehavior } from './helpers/loopback-upstream';
import { listTrustedOperationSummaries, findTrustedOperation } from '../trusted-operation-registry';

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);

async function withSupportedDataSourceAsync<T>(fn: () => Promise<T>): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of (
    require('@lowcode-platform/schema-contract') as typeof import('@lowcode-platform/schema-contract')
  ).CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: (
      require('@lowcode-platform/schema-contract') as typeof import('@lowcode-platform/schema-contract')
    ).createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  policyModule.getTrustedExecutionPolicy = () => 'operation-only';
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  }
}

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
);

const GRANTED_PERMISSION = 'data-source:demo.items.search:execute';

class PageGrantingIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): undefined {
    // 逐请求身份：恒拒（证明目录过滤 ≠ 逐请求授权）
    return undefined;
  }

  override resolvePageIdentity(): TrustedDataSourceIdentity {
    return {
      userId: 'catalog-tester',
      tenantId: 'demo-tenant',
      grantedPermissions: new Set([GRANTED_PERMISSION]),
    };
  }
}

class NoPermissionPageIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): undefined {
    return undefined;
  }

  override resolvePageIdentity(): TrustedDataSourceIdentity {
    return {
      userId: 'no-perm-tester',
      tenantId: 'demo-tenant',
      grantedPermissions: new Set(['something:else']),
    };
  }
}

function applyProductionPipes(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}

describe('Data source operation catalog (M1b-1 PR D / Refs #64) — D5', () => {
  const originalSecret = process.env.API_SECRET;
  let tmpDir: string;
  let defaultApp: INestApplication;
  let trustedApp: INestApplication;
  let noPermApp: INestApplication;
  let upstream: LoopbackUpstreamServer;

  const PAGE_ID = 'catalog-page';
  let pageVersion: number;

  beforeAll(async () => {
    process.env.API_SECRET = 'test-secret';
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'm1b-catalog-'));
    process.env.PAGE_SCHEMA_FILE_PATH = path.join(tmpDir, 'store.json');

    upstream = await LoopbackUpstreamServer.create(
      route({
        '/demo/items/search': (req, res) =>
          searchBehavior([{ id: 'item-1', title: 'Apple Pie', price: 12 }], req, res),
      }),
    );

    const defaultModuleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DataSourceModule],
    }).compile();
    defaultApp = defaultModuleRef.createNestApplication();
    applyProductionPipes(defaultApp);
    defaultApp.useGlobalFilters(new HttpExceptionFilter());
    defaultApp.useGlobalInterceptors(new TransformInterceptor());
    await defaultApp.init();

    await withSupportedDataSourceAsync(async () => {
      const pageService = defaultApp.get(PageSchemaService);
      const saved = await pageService.saveSchema({ pageId: PAGE_ID, schema: m1bFixture.schema });
      pageVersion = saved.pageVersion;
    });

    const buildApp = async (
      adapterClass: new () => DataSourceIdentityAdapter,
    ): Promise<INestApplication> => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), DataSourceModule],
      })
        .overrideProvider(DataSourceIdentityAdapter)
        .useClass(adapterClass)
        .overrideProvider(DATA_SOURCE_UPSTREAM_TARGETS)
        .useValue({ 'demo.items.search@1': upstream.url('/demo/items/search') })
        .compile();
      const app = moduleRef.createNestApplication();
      applyProductionPipes(app);
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalInterceptors(new TransformInterceptor());
      await app.init();
      return app;
    };

    // 与 endpoint spec 同型：app.init()（provider 实例化触发仓储磁盘加载）
    // 必须在矩阵+operation-only 窗口内执行，store 已含 data-source 页面
    await withSupportedDataSourceAsync(async () => {
      trustedApp = await buildApp(PageGrantingIdentityAdapter);
      noPermApp = await buildApp(NoPermissionPageIdentityAdapter);
    });
  });

  afterAll(async () => {
    if (defaultApp) await defaultApp.close();
    if (trustedApp) await trustedApp.close();
    if (noPermApp) await noPermApp.close();
    if (upstream) await upstream.stop();
    if (originalSecret === undefined) delete process.env.API_SECRET;
    else process.env.API_SECRET = originalSecret;
    delete process.env.PAGE_SCHEMA_FILE_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('paramsContract 单源派生（防漂移）', () => {
    const operation = findTrustedOperation('demo.items.search', '1')!;

    it('exposes the structured contract in summaries', () => {
      const summaries = listTrustedOperationSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].paramsContract).toEqual(operation.paramsContract);
      expect(summaries[0].paramsContract.query).toEqual({
        type: 'string',
        required: false,
        maxLength: 128,
      });
      expect(summaries[0].paramsContract.limit).toEqual({
        type: 'integer',
        required: false,
        min: 1,
        max: 50,
      });
    });

    it.each([
      ['limit 0', { limit: 0 }, false],
      ['limit 1', { limit: 1 }, true],
      ['limit 50', { limit: 50 }, true],
      ['limit 51', { limit: 51 }, false],
      ['limit float', { limit: 1.5 }, false],
      ['query empty', { query: '' }, true],
      ['query 128 chars', { query: 'a'.repeat(128) }, true],
      ['query 129 chars', { query: 'a'.repeat(129) }, false],
      ['query non-string', { query: 5 }, false],
      ['unknown key', { other: 1 }, false],
    ])('validator behavior matches contract bounds: %s', (_name, params, shouldPass) => {
      const { issues } = operation.validateParams(params as unknown as Record<string, never>);
      expect(issues.length === 0).toBe(shouldPass);
    });

    it('keeps the exact diagnostic message format (behavior regression line)', () => {
      expect(operation.validateParams({ limit: 51 }).issues[0].message).toBe(
        'Param "limit" must be an integer between 1 and 50',
      );
      expect(operation.validateParams({ query: 'a'.repeat(129) }).issues[0].message).toBe(
        'Param "query" length (129) exceeded limit of 128',
      );
      expect(operation.validateParams({ other: true }).issues[0].message).toBe(
        'Unknown param "other" for demo.items.search',
      );
    });
  });

  describe('HTTP 目录路由（AuthGuard，只读）', () => {
    it('returns the permission-filtered catalog for a page-scoped identity (200)', async () => {
      const response = await request(trustedApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion })
        .set('Authorization', 'Bearer test-secret')
        .expect(200);
      const operations = response.body.data?.operations ?? [];
      expect(operations).toHaveLength(1);
      expect(operations[0].operationId).toBe('demo.items.search');
      expect(operations[0].revision).toBe('1');
      expect(operations[0].paramsContract?.query?.maxLength).toBe(128);
    });

    it('returns an empty catalog when the page identity holds no required permission (fail-close)', async () => {
      const response = await request(noPermApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion })
        .set('Authorization', 'Bearer test-secret')
        .expect(200);
      expect(response.body.data?.operations ?? []).toEqual([]);
    });

    it('returns an empty catalog when the identity adapter is unconfigured (default deployment)', async () => {
      const response = await request(defaultApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion })
        .set('Authorization', 'Bearer test-secret')
        .expect(200);
      expect(response.body.data?.operations ?? []).toEqual([]);
    });

    it('rejects missing/invalid query params with 400 (typed DTO validation)', async () => {
      await request(trustedApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID })
        .set('Authorization', 'Bearer test-secret')
        .expect(400);
      await request(trustedApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion: 0 })
        .set('Authorization', 'Bearer test-secret')
        .expect(400);
      await request(trustedApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion })
        .expect(401);
    });
  });

  describe('目录过滤 ≠ 逐请求授权（负例钉住）', () => {
    it('catalog lists the operation while per-request execution is FORBIDDEN with zero upstream calls', async () => {
      const upstreamCountBefore = upstream.countFor('/demo/items/search');

      const catalog = await request(trustedApp.getHttpServer())
        .get('/data-source/operations')
        .query({ pageId: PAGE_ID, pageVersion })
        .set('Authorization', 'Bearer test-secret')
        .expect(200);
      expect((catalog.body.data?.operations ?? []).length).toBe(1);

      await withSupportedDataSourceAsync(async () => {
        await request(trustedApp.getHttpServer())
          .post(`/pages/${PAGE_ID}/data-sources/searchItems/execute`)
          .set('Authorization', 'Bearer test-secret')
          .send({ pageVersion, params: { query: 'Apple' } })
          .expect(403);
      });

      expect(upstream.countFor('/demo/items/search')).toBe(upstreamCountBefore);
    });
  });

  describe('DataSourceCatalogService（服务层）', () => {
    it('unconfigured page identity resolves to an empty catalog', async () => {
      const service = defaultApp.get(DataSourceCatalogService);
      const result = await service.listOperationsForPage(PAGE_ID, pageVersion);
      expect(result.operations).toEqual([]);
      expect(result.identityResolved).toBe(false);
    });

    it('page-granting identity yields exactly the authorized operation', async () => {
      const service = trustedApp.get(DataSourceCatalogService);
      const result = await service.listOperationsForPage(PAGE_ID, pageVersion);
      expect(result.identityResolved).toBe(true);
      expect(result.operations.map((entry) => entry.operationId)).toEqual(['demo.items.search']);
    });
  });
});
