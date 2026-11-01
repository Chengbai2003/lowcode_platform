import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { ConfigModule } from '@nestjs/config';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { DataSourceModule } from '../../data-source/data-source.module';
import { DataSourceCatalogService } from '../../data-source/data-source-catalog.service';
import {
  DataSourceIdentityAdapter,
  TrustedDataSourceIdentity,
} from '../../data-source/data-source-identity.adapter';
import { DATA_SOURCE_UPSTREAM_TARGETS } from '../../data-source/upstream-targets.provider';
import { PageSchemaModule } from '../../page-schema/page-schema.module';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { PageSchemaRepository } from '../../page-schema/repositories/page-schema.repository';
import { PageRuntimeMetadataProvider } from '../../page-schema/page-runtime-metadata.provider';
import { CompilerService } from '../../compiler/compiler.service';
import { ContextAssemblerService } from '../../schema-context';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from '../../schema-context/collection-target-resolver.service';
import { PatchApplyService } from '../patch-apply.service';
import { PatchAutoFixService } from '../patch-auto-fix.service';
import { PatchValidationService } from '../patch-validation.service';
import { ToolExecutionService } from '../tool-execution.service';
import { ToolRegistryService } from '../tool-registry.service';
import type { ToolExecutionContext } from '../types/tool.types';
import type { EditorPatchOperation } from '../types/editor-patch.types';
import type { EditorPatchOperationDto } from '../dto/editor-patch.dto';
import {
  LoopbackUpstreamServer,
  route,
  searchBehavior,
} from '../../data-source/__tests__/helpers/loopback-upstream';
import type { PageSchema } from '@lowcode-platform/schema-contract';

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);
const contract =
  require('@lowcode-platform/schema-contract') as typeof import('@lowcode-platform/schema-contract');

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../../../../test-fixtures/m1b-d-editor-closure.json',
);

/**
 * D1 主链全程运行在「矩阵放行 + operation-only」可信测试窗口内
 * （生产清单与默认策略字节不变；窗口外负例由既有 ingress spec 覆盖）。
 */
async function withTestWindowAsync<T>(fn: () => Promise<T>): Promise<T> {
  const originalManifest = manifestModule.getTrustedCapabilityManifest;
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of contract.CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  policyModule.getTrustedExecutionPolicy = () => 'operation-only';
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = originalManifest;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  }
}

class FullGrantIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): TrustedDataSourceIdentity {
    return {
      userId: 'd1-tester',
      tenantId: 'demo-tenant',
      grantedPermissions: new Set(['data-source:demo.items.search:execute']),
    };
  }

  override resolvePageIdentity(): TrustedDataSourceIdentity {
    return this.resolveIdentity();
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

const PAGE_ID = 'm1b-d-closure-page';
const UPSTREAM_ITEMS = [
  { id: 'item-1', title: 'Apple Pie', price: 12 },
  { id: 'item-2', title: 'Apple Juice', price: 8 },
];

/** 基线 v1 页面：无数据源（保存于 operation-only 窗口内合法——无 apiCall） */
const BASE_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['searchBtn'] },
    searchBtn: {
      id: 'searchBtn',
      type: 'Button',
      props: { children: '查询' },
      events: { onClick: [{ type: 'log', value: { type: 'literal', value: 'before' } }] },
    },
  },
};

const NEXT_LOGIC = {
  states: { query: '', rows: [] },
  dataSources: {
    searchItems: { operationRef: { operationId: 'demo.items.search', revision: '1' } },
  },
};

const SEARCH_ACTION = {
  type: 'executeDataSource',
  sourceId: 'searchItems',
  resultTo: 'state.rows',
};

function sanitizeSample(value: unknown): unknown {
  const text = JSON.stringify(value);
  return JSON.parse(
    text
      .replace(/"\d{4}-\d{2}-\d{2}T[^"]*"/g, '"<timestamp>"')
      .replace(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g, '"<uuid>"')
      .replace(/"path":"[^"]*"/g, '"path":"<path>"'),
  );
}

function stableClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGeneratedComponentBody(code: string): string {
  // 与 generator.datasource.spec 同型：截到 JSX 渲染 return 之前（new Function 不解析 JSX）
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
  return { value, getState: () => renderedState, unmount: () => unmountCleanup?.() };
}

function extractClickHandlerNames(code: string): string[] {
  const names: string[] = [];
  const pattern = /const (handle\w+) = (?:async )?\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('M1b-1 PR D editor closure e2e (Refs #64) — D1', () => {
  const originalSecret = process.env.API_SECRET;
  const originalStorePath = process.env.PAGE_SCHEMA_FILE_PATH;
  let tmpDir: string;
  let upstream: LoopbackUpstreamServer;
  let trustedApp: INestApplication;
  let defaultApp: INestApplication | undefined;
  let toolExecution: ToolExecutionService;

  const buildApp = async (
    adapter?: new () => DataSourceIdentityAdapter,
  ): Promise<INestApplication> => {
    const builder = Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PageSchemaModule, DataSourceModule],
    });
    if (adapter) {
      builder
        .overrideProvider(DataSourceIdentityAdapter)
        .useClass(adapter)
        .overrideProvider(DATA_SOURCE_UPSTREAM_TARGETS)
        .useValue({ 'demo.items.search@1': upstream.url('/demo/items/search') });
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    applyProductionPipes(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    return app;
  };

  beforeAll(async () => {
    process.env.API_SECRET = 'test-secret';
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'm1b-d-closure-'));
    process.env.PAGE_SCHEMA_FILE_PATH = path.join(tmpDir, 'store.json');

    upstream = await LoopbackUpstreamServer.create(
      route({
        '/demo/items/search': (req, res) => searchBehavior(UPSTREAM_ITEMS, req, res),
      }),
    );

    await withTestWindowAsync(async () => {
      trustedApp = await buildApp(FullGrantIdentityAdapter);
    });

    // Agent 工具：真实注册表 + 真实 PageSchemaService（同一 store）
    const contextAssemblerMock = { assemble: jest.fn() } as unknown as ContextAssemblerService;
    const metaRegistry = new ComponentMetaRegistry();
    const patchApplyService = new PatchApplyService();
    const patchValidationService = new PatchValidationService(metaRegistry, patchApplyService);
    const registry = new ToolRegistryService(
      contextAssemblerMock,
      metaRegistry,
      new CollectionTargetResolverService(metaRegistry),
      new PatchAutoFixService(),
      patchValidationService,
      undefined,
      trustedApp.get(DataSourceCatalogService),
    );
    toolExecution = new ToolExecutionService(
      trustedApp.get(PageSchemaService),
      contextAssemblerMock,
      registry,
    );
  });

  afterAll(async () => {
    if (trustedApp) await trustedApp.close();
    if (defaultApp) await defaultApp.close();
    if (upstream) await upstream.stop();
    if (originalSecret === undefined) delete process.env.API_SECRET;
    else process.env.API_SECRET = originalSecret;
    if (originalStorePath === undefined) delete process.env.PAGE_SCHEMA_FILE_PATH;
    else process.env.PAGE_SCHEMA_FILE_PATH = originalStorePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  let basePageVersionValue: number;
  let realPatch: EditorPatchOperation[];
  let expectedSchema: PageSchema;
  let compiledCode: string;
  const endpointSamples: Record<string, unknown> = {};

  it('step 1-4: 保存 v1 → 真实 write 工具产出真实 Patch → 服务端预览全等', async () => {
    await withTestWindowAsync(async () => {
      const pageService = trustedApp.get(PageSchemaService);
      const saved = await pageService.saveSchema({
        pageId: PAGE_ID,
        schema: stableClone(BASE_SCHEMA),
      });
      basePageVersionValue = saved.pageVersion;
      expect(basePageVersionValue).toBe(1);

      const context: ToolExecutionContext = {
        pageId: PAGE_ID,
        basePageVersion: 1,
        resolvedPageVersion: 1,
        workingSchema: stableClone(BASE_SCHEMA) as PageSchema,
        accumulatedPatch: [],
        warnings: [],
        traceId: 'trace-m1b-d1',
        runtimeCompatibility: {
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      };

      await toolExecution.executeTool(
        'replace_page_logic',
        { logic: stableClone(NEXT_LOGIC) },
        context,
      );
      await toolExecution.executeTool(
        'bind_event',
        {
          componentId: 'searchBtn',
          event: 'onClick',
          actions: [stableClone(SEARCH_ACTION)],
        },
        context,
      );

      realPatch = stableClone(context.accumulatedPatch) as EditorPatchOperation[];
      expect(Array.isArray(realPatch)).toBe(true);
      expect(realPatch.length).toBe(2);
      expectedSchema = stableClone(context.workingSchema) as PageSchema;

      // 服务端预览（真实 previewPatch）与工具工作区全等
      const preview = await toolExecution.previewPatch(
        {
          pageId: PAGE_ID,
          basePageVersion: 1,
          patch: stableClone(realPatch) as unknown as EditorPatchOperationDto[],
        },
        'trace-m1b-d1-preview',
      );
      expect(stableClone(preview.schema)).toEqual(expectedSchema);
    });
  });

  it('step 5-7: HTTP CAS 保存 v2 → 旧 basePageVersion 409 → 新仓储实例回读全等且仅声明', async () => {
    await withTestWindowAsync(async () => {
      const saved = await request(trustedApp.getHttpServer())
        .put(`/pages/${PAGE_ID}/schema`)
        .set('Authorization', 'Bearer test-secret')
        .send({ schema: stableClone(expectedSchema), basePageVersion: 1 })
        .expect(200);
      expect(saved.body.data?.pageVersion ?? saved.body.pageVersion).toBe(2);
      endpointSamples.saveSuccess = sanitizeSample(saved.body);

      const conflict = await request(trustedApp.getHttpServer())
        .put(`/pages/${PAGE_ID}/schema`)
        .set('Authorization', 'Bearer test-secret')
        .send({ schema: stableClone(expectedSchema), basePageVersion: 1 })
        .expect(409);
      const conflictText = JSON.stringify(conflict.body);
      expect(conflictText).toContain('"expectedVersion":2');
      expect(conflictText).toContain('"receivedVersion":1');

      // 全新仓储实例（新对象、onModuleInit 重读磁盘，不复用任何内存态）回读 v2：声明全等、仅含声明键
      const freshRepository = new PageSchemaRepository();
      await freshRepository.onModuleInit();
      const freshService = new PageSchemaService(
        freshRepository,
        new PageRuntimeMetadataProvider(),
      );
      const reloaded = await freshService.getSchema(PAGE_ID, 2);
      expect(stableClone(reloaded.schema)).toEqual(expectedSchema);
      const logicKeys = Object.keys((reloaded.schema as { logic?: object }).logic ?? {});
      for (const key of logicKeys) {
        expect(['states', 'computed', 'flows', 'dataSources']).toContain(key);
      }
      expect(
        JSON.stringify(stableClone(reloaded.schema)).includes('traceId') ||
          JSON.stringify(stableClone(reloaded.schema)).includes('AbortController'),
      ).toBe(false);
    });
  });

  it('step 8-9: 真实 Compiler 编译回读页面 → 生成代码含宿主调用', async () => {
    await withTestWindowAsync(async () => {
      const compiler = new CompilerService(trustedApp.get(PageSchemaService));
      const result = await compiler.compile({
        schema: stableClone(expectedSchema) as Record<string, unknown>,
        options: { pageId: PAGE_ID, pageVersion: 2 },
      });
      compiledCode = result.code;
      expect(compiledCode).toContain('__executeDataSource');
      expect(compiledCode).toContain('dataSources?.execute');
    });
  });

  it('step 10: 编译产物经真实 HTTP 端点执行 → state 整值写入；错误路径脱敏且零上游', async () => {
    await withTestWindowAsync(async () => {
      const httpBackedService = {
        execute: async (
          input: { sourceId: string; params?: Record<string, unknown> },
          _signal?: AbortSignal,
        ) => {
          const res = await request(trustedApp.getHttpServer())
            .post(`/pages/${PAGE_ID}/data-sources/${input.sourceId}/execute`)
            .set('Authorization', 'Bearer test-secret')
            .send({ pageVersion: 2, params: input.params ?? {} });
          if (res.status === 200) {
            const data = res.body.data;
            endpointSamples.executeSuccess = sanitizeSample(res.body);
            return {
              ok: true as const,
              result: data.result,
              operationId: data.operationId,
              revision: data.revision,
              traceId: data.traceId,
            };
          }
          return {
            ok: false as const,
            code: res.body.code,
            message: res.body.message,
            traceId: res.body.traceId,
          };
        },
      };

      const [clickHandler] = extractClickHandlerNames(compiledCode);
      expect(clickHandler).toBe('handleSearchBtnClick');
      const harness = createDataSourceHarness(
        compiledCode,
        httpBackedService,
        `{ ${clickHandler} }`,
      );
      const handler = harness.value[clickHandler] as (event?: unknown) => void;

      const before = upstream.countFor('/demo/items/search');
      handler({});
      await tick(40);
      expect(upstream.countFor('/demo/items/search')).toBe(before + 1);
      expect((harness.getState() as { rows: unknown }).rows).toEqual({ items: UPSTREAM_ITEMS });

      // 错误路径：非法参数（limit 99）→ INVALID_PARAMS、上游零调用、脱敏消息
      const invalid = await httpBackedService.execute({
        sourceId: 'searchItems',
        params: { limit: 99 },
      });
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) {
        expect(invalid.code).toBe('INVALID_PARAMS');
        expect(invalid.message).not.toContain('127.0.0.1');
        endpointSamples.executeInvalidParams = sanitizeSample({
          statusCode: 400,
          ...(await (async () => {
            const res = await request(trustedApp.getHttpServer())
              .post(`/pages/${PAGE_ID}/data-sources/searchItems/execute`)
              .set('Authorization', 'Bearer test-secret')
              .send({ pageVersion: 2, params: { limit: 99 } });
            return res.body;
          })()),
        });
      }
      expect(upstream.countFor('/demo/items/search')).toBe(before + 1);

      // FORBIDDEN：默认装配（未配置身份）确定性拒绝、零上游。
      // 页面保存后才初始化默认装配，使其仓储从磁盘加载到同一份 store。
      defaultApp = await buildApp();
      const forbiddenRes = await request(defaultApp!.getHttpServer())
        .post(`/pages/${PAGE_ID}/data-sources/searchItems/execute`)
        .set('Authorization', 'Bearer test-secret')
        .send({ pageVersion: 2, params: {} });
      expect(forbiddenRes.status).toBe(403);
      endpointSamples.executeForbidden = sanitizeSample(forbiddenRes.body);
      await defaultApp.close();
      defaultApp = undefined;

      // 401：缺鉴权头（未知码路径的真实字节）
      const unauthorizedRes = await request(trustedApp.getHttpServer())
        .post(`/pages/${PAGE_ID}/data-sources/searchItems/execute`)
        .send({ pageVersion: 2, params: {} });
      expect(unauthorizedRes.status).toBe(401);
      endpointSamples.executeUnauthorized = sanitizeSample(unauthorizedRes.body);

      harness.unmount();
    });
  });

  it('fixture: 真实链产物与共享 fixture 全等（或以 UPDATE_M1B_D_FIXTURE=1 生成）', () => {
    const fixture = {
      baseSchema: stableClone(BASE_SCHEMA),
      patch: stableClone(realPatch),
      expectedSchema: stableClone(expectedSchema),
      compiledCode,
      endpointSamples,
    };
    if (process.env.UPDATE_M1B_D_FIXTURE === '1') {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
      return;
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const committed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    expect(fixture).toEqual(committed);
  });
});
