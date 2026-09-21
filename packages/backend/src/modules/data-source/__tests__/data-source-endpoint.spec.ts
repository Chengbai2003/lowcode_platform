import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import * as contract from '@lowcode-platform/schema-contract';
import { DataSourceModule } from '../data-source.module';
import { DataSourceExecutionService } from '../data-source-execution.service';
import {
  DataSourceIdentityAdapter,
  type TrustedDataSourceIdentity,
} from '../data-source-identity.adapter';
import { DATA_SOURCE_UPSTREAM_TARGETS } from '../upstream-targets.provider';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { PageSchemaRepository } from '../../page-schema/repositories/page-schema.repository';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import {
  LoopbackUpstreamServer,
  route,
  searchBehavior,
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

class EndpointIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): TrustedDataSourceIdentity {
    return {
      userId: 'endpoint-tester',
      tenantId: 'demo-tenant',
      grantedPermissions: new Set(['data-source:demo.items.search:execute']),
    };
  }
}

/**
 * 与 main.ts 完全一致的生产全局 ValidationPipe（whitelist/forbidNonWhitelisted/
 * transform/enableImplicitConversion）——端点测试必须装上同款管道，证明生产
 * 入口与契约校验一致：body 未类型化透传使管道不做转换/剥离/提前拒绝。
 */
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

const UPSTREAM_ITEMS: UpstreamSearchItem[] = [
  { id: 'item-1', title: 'Apple Pie', price: 12 },
  { id: 'item-2', title: 'Apple Juice', price: 8 },
];

describe('DataSource execution endpoint (M1b-1 PR B / Refs #64)', () => {
  const originalSecret = process.env.API_SECRET;
  let tmpDir: string;
  let upstream: LoopbackUpstreamServer;
  let defaultApp: INestApplication;
  let trustedApp: INestApplication;

  beforeAll(async () => {
    process.env.API_SECRET = 'test-secret';
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'm1b-endpoint-'));
    process.env.PAGE_SCHEMA_FILE_PATH = path.join(tmpDir, 'store.json');

    upstream = await LoopbackUpstreamServer.create(
      route({
        '/demo/items/search': (req, res) => searchBehavior(UPSTREAM_ITEMS, req, res),
      }),
    );

    // 默认装配：不 override 任何 provider（未配置身份适配器 + 空目标绑定）
    const defaultModuleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DataSourceModule],
    }).compile();
    defaultApp = defaultModuleRef.createNestApplication();
    applyProductionPipes(defaultApp);
    defaultApp.useGlobalFilters(new HttpExceptionFilter());
    defaultApp.useGlobalInterceptors(new TransformInterceptor());
    await defaultApp.init();

    // 构造阶段：以可信测试矩阵写入含声明的快照（先于 trusted app 初始化，
    // 使其仓储从磁盘加载到同一份 store 时已包含该页面）
    await withSupportedDataSourceAsync(async () => {
      const pageService = defaultApp.get(PageSchemaService);
      await pageService.saveSchema({ pageId: 'endpoint-page', schema: m1bFixture.schema });
    });

    // 可信测试装配：注入测试身份与 loopback 目标绑定（生产默认清单不变）
    const trustedModuleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DataSourceModule],
    })
      .overrideProvider(DataSourceIdentityAdapter)
      .useClass(EndpointIdentityAdapter)
      .overrideProvider(DATA_SOURCE_UPSTREAM_TARGETS)
      .useValue({ 'demo.items.search@1': upstream.url('/demo/items/search') })
      .compile();
    trustedApp = trustedModuleRef.createNestApplication();
    applyProductionPipes(trustedApp);
    trustedApp.useGlobalFilters(new HttpExceptionFilter());
    trustedApp.useGlobalInterceptors(new TransformInterceptor());
    // trusted app 的仓储初始化要重读含 data-source 快照的 store，与构造阶段
    // 同样必须在可信测试矩阵下进行（磁盘加载本身即 A 阶段的门禁入口）
    await withSupportedDataSourceAsync(() => trustedApp.init());
  });

  afterAll(async () => {
    await defaultApp.close();
    await trustedApp.close();
    await upstream.stop();
    delete process.env.PAGE_SCHEMA_FILE_PATH;
    if (originalSecret === undefined) {
      delete process.env.API_SECRET;
    } else {
      process.env.API_SECRET = originalSecret;
    }
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  const executeUrl = (pageId = 'endpoint-page', sourceId = 'searchItems') =>
    `/pages/${pageId}/data-sources/${sourceId}/execute`;

  it('responds 200 with the validated result through the trusted wiring', async () => {
    const response = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 1, params: { query: 'apple' } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      ok: true,
      operationId: 'demo.items.search',
      revision: '1',
    });
    expect(response.body.data.result).toEqual({
      items: [
        { id: 'item-1', title: 'Apple Pie', price: 12 },
        { id: 'item-2', title: 'Apple Juice', price: 8 },
      ],
    });
    expect(typeof response.body.data.traceId).toBe('string');
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('deterministically rejects with FORBIDDEN under default providers (no identity adapter)', async () => {
    const response = await withSupportedDataSourceAsync(() =>
      request(defaultApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 1 }),
    );

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(typeof response.body.traceId).toBe('string');
    // 该请求未到达上游：计数仍为上一用例的 1
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('rejects with CAPABILITY_DENIED under the real production manifest', async () => {
    const response = await request(trustedApp.getHttpServer())
      .post(executeUrl())
      .set('Authorization', 'Bearer test-secret')
      .send({ pageVersion: 1 });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CAPABILITY_DENIED');
    expect(response.body.message).toContain('data-source');
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('rejects body shape violations with 400 INVALID_PARAMS', async () => {
    const extraFieldResponse = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 1, url: 'http://evil.example.com' }),
    );
    expect(extraFieldResponse.status).toBe(400);
    expect(extraFieldResponse.body.code).toBe('INVALID_PARAMS');
    expect(typeof extraFieldResponse.body.traceId).toBe('string');

    const badParamsResponse = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 1, params: { tenantId: 'smuggled' } }),
    );
    expect(badParamsResponse.status).toBe(400);
    expect(badParamsResponse.body.code).toBe('INVALID_PARAMS');

    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('keeps contract semantics under the production ValidationPipe (review P2)', async () => {
    // 生产管道（whitelist/forbidNonWhitelisted/transform+隐式转换）已装上：
    // body 未类型化透传 → 管道不转换、不剥离、不提前裸 400，
    // 非法 pageVersion 与未知字段都由契约校验器给出 INVALID_PARAMS + traceId
    const booleanVersion = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: true, params: { query: 'apple' } }),
    );
    expect(booleanVersion.status).toBe(400);
    expect(booleanVersion.body.code).toBe('INVALID_PARAMS');
    expect(typeof booleanVersion.body.traceId).toBe('string');

    const stringVersion = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: '1', params: { query: 'apple' } }),
    );
    expect(stringVersion.status).toBe(400);
    expect(stringVersion.body.code).toBe('INVALID_PARAMS');
    expect(typeof stringVersion.body.traceId).toBe('string');

    const missingVersion = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl())
        .set('Authorization', 'Bearer test-secret')
        .send({ params: { query: 'apple' } }),
    );
    expect(missingVersion.status).toBe(400);
    expect(missingVersion.body.code).toBe('INVALID_PARAMS');
    expect(typeof missingVersion.body.traceId).toBe('string');

    // 全部拒绝均未到达上游
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('rejects body-carried pageId/sourceId overriding the path (review round 2, 异值)', async () => {
    // URL 指向 endpoint-page/searchItems，body 携带另一页面/数据源：
    // 覆盖通道必须在合并前拒绝，执行目标不得变成 body 指定的值
    const response = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl('endpoint-page', 'searchItems'))
        .set('Authorization', 'Bearer test-secret')
        .send({
          pageVersion: 1,
          pageId: 'body-page',
          sourceId: 'bodySource',
          params: { query: 'apple' },
        }),
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PARAMS');
    expect(typeof response.body.traceId).toBe('string');
    expect(response.body.message).toContain('path parameter');
    // 零上游调用：计数保持前置用例的 1
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('rejects body-carried pageId/sourceId even when identical to the path (review round 2, 同值)', async () => {
    const response = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl('endpoint-page', 'searchItems'))
        .set('Authorization', 'Bearer test-secret')
        .send({
          pageVersion: 1,
          pageId: 'endpoint-page',
          sourceId: 'searchItems',
        }),
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PARAMS');
    expect(typeof response.body.traceId).toBe('string');
    expect(response.body.message).toContain('path parameter');
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('returns 404 for unknown pages', async () => {
    const response = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer())
        .post(executeUrl('missing-page'))
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 1 }),
    );
    expect(response.status).toBe(404);
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('requires authentication (AuthGuard applies to the new route)', async () => {
    const response = await withSupportedDataSourceAsync(() =>
      request(trustedApp.getHttpServer()).post(executeUrl()).send({ pageVersion: 1 }),
    );
    expect(response.status).toBe(401);
    expect(upstream.countFor('/demo/items/search')).toBe(1);
  });

  it('exposes the execution service for future module composition', () => {
    expect(trustedApp.get(DataSourceExecutionService)).toBeInstanceOf(DataSourceExecutionService);
  });
});
