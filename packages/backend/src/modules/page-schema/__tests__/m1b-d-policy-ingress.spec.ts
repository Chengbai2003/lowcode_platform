import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { BadRequestException } from '@nestjs/common';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { PageSchemaService } from '../page-schema.service';
import { PageSchemaRepository } from '../repositories/page-schema.repository';
import { PageRuntimeMetadataProvider } from '../page-runtime-metadata.provider';
import { ContextAssemblerService } from '../../schema-context';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from '../../schema-context/collection-target-resolver.service';
import { DataSourceCatalogService } from '../../data-source/data-source-catalog.service';
import {
  DataSourceIdentityAdapter,
  TrustedDataSourceIdentity,
} from '../../data-source/data-source-identity.adapter';
import { PatchApplyService } from '../../agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../../agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../../agent-tools/patch-validation.service';
import { ToolExecutionService } from '../../agent-tools/tool-execution.service';
import { ToolRegistryService } from '../../agent-tools/tool-registry.service';
import type { ToolExecutionContext } from '../../agent-tools/types/tool.types';
import type { PageSchema as BackendPageSchema } from '@lowcode-platform/schema-contract';

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);
const contract =
  require('@lowcode-platform/schema-contract') as typeof import('@lowcode-platform/schema-contract');

/**
 * 可信测试窗口（矩阵放行 + 指定执行策略）。生产清单与默认策略字节不变。
 */
async function withTestWindowAsync<T>(
  policy: 'legacy' | 'operation-only',
  fn: () => Promise<T>,
): Promise<T> {
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
  policyModule.getTrustedExecutionPolicy = () => policy;
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = originalManifest;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  }
}

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
) as { schema: PageSchema; legacyApiCallSchema: PageSchema };

function buildPageSchemaService(storeFilePath: string): PageSchemaService {
  (process as unknown as { env: Record<string, string> }).env.PAGE_SCHEMA_FILE_PATH = storeFilePath;
  return new PageSchemaService(new PageSchemaRepository(), new PageRuntimeMetadataProvider());
}

function readIssues(error: unknown): { code: string; message: string }[] {
  const detail = (error as BadRequestException).getResponse() as {
    issues?: { code: string; message: string }[];
    details?: { issues?: { code: string; message: string }[] };
    message?: string;
  };
  return (
    detail?.issues ??
    detail?.details?.issues ?? [{ code: 'UNKNOWN', message: detail?.message ?? '' }]
  );
}

class CatalogIdentityAdapter extends DataSourceIdentityAdapter {
  resolveIdentity(): undefined {
    return undefined;
  }

  override resolvePageIdentity(): TrustedDataSourceIdentity {
    return {
      userId: 'agent-catalog-tester',
      tenantId: 'demo-tenant',
      grantedPermissions: new Set(['data-source:demo.items.search:execute']),
    };
  }
}

function buildToolServices(catalog?: DataSourceCatalogService): {
  toolExecution: ToolExecutionService;
  registry: ToolRegistryService;
} {
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
    catalog,
  );
  const pageSchemaServiceMock = {
    getSchema: jest.fn(),
    saveSchema: jest.fn(),
  } as unknown as PageSchemaService;
  const toolExecution = new ToolExecutionService(
    pageSchemaServiceMock,
    contextAssemblerMock,
    registry,
  );
  return { toolExecution, registry };
}

function buildToolContext(schema: BackendPageSchema, pageId?: string): ToolExecutionContext {
  return {
    pageId,
    basePageVersion: 1,
    resolvedPageVersion: 1,
    workingSchema: schema,
    accumulatedPatch: [],
    warnings: [],
    traceId: 'trace-m1b-d-policy',
    runtimeCompatibility: {
      componentPresetId: 'builtin-antd',
      componentPresetVersion: '1',
      rendererVersion: '1',
    },
  };
}

describe('Execution policy ingress (M1b-1 PR D / Refs #64) — D6 backend 面', () => {
  const originalSecret = process.env.PAGE_SCHEMA_FILE_PATH;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm1b-d-policy-'));
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PAGE_SCHEMA_FILE_PATH;
    else process.env.PAGE_SCHEMA_FILE_PATH = originalSecret;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('Storage 保存入口（PageSchemaService.saveSchema → requireSupportedPageSchema）', () => {
    it('legacy 策略下（矩阵放行）保存 data-source 页面被拒：DATASOURCE_REQUIRES_OPERATION_ONLY', async () => {
      const service = buildPageSchemaService(path.join(tmpDir, 'store-legacy.json'));
      let caught: unknown;
      await withTestWindowAsync('legacy', async () => {
        try {
          await service.saveSchema({ pageId: 'policy-page', schema: m1bFixture.schema });
        } catch (error) {
          caught = error;
        }
      });
      expect(caught).toBeInstanceOf(BadRequestException);
      const issues = readIssues(caught);
      expect(issues.some((i) => i.code === 'DATASOURCE_REQUIRES_OPERATION_ONLY')).toBe(true);
    });

    it('operation-only 策略下保存纯 apiCall 页面被拒：APICALL_FORBIDDEN_BY_POLICY（矩阵无关）', async () => {
      const service = buildPageSchemaService(path.join(tmpDir, 'store-oponly.json'));
      let caught: unknown;
      await withTestWindowAsync('operation-only', async () => {
        try {
          await service.saveSchema({
            pageId: 'policy-page-2',
            schema: m1bFixture.legacyApiCallSchema,
          });
        } catch (error) {
          caught = error;
        }
      });
      expect(caught).toBeInstanceOf(BadRequestException);
      const issues = readIssues(caught);
      expect(issues.some((i) => i.code === 'APICALL_FORBIDDEN_BY_POLICY')).toBe(true);
    });

    it('operation-only 策略下（矩阵放行）保存 data-source 页面成功（声明持久化）', async () => {
      const service = buildPageSchemaService(path.join(tmpDir, 'store-ok.json'));
      const saved = await withTestWindowAsync('operation-only', () =>
        service.saveSchema({ pageId: 'policy-page-3', schema: m1bFixture.schema }),
      );
      expect(saved.pageVersion).toBe(1);
    });

    it('生产默认（legacy + 生产清单）下纯 apiCall 页面保存成功（行为字节不变）', async () => {
      const service = buildPageSchemaService(path.join(tmpDir, 'store-default.json'));
      const saved = await service.saveSchema({
        pageId: 'policy-page-4',
        schema: m1bFixture.legacyApiCallSchema,
      });
      expect(saved.pageVersion).toBe(1);
    });
  });

  describe('Agent 目录工具 list_data_source_operations', () => {
    it('page-scoped 身份授权 → 目录恰含授权操作（含 paramsContract）', async () => {
      const catalog = new DataSourceCatalogService(new CatalogIdentityAdapter());
      const { toolExecution } = buildToolServices(catalog);
      const result = await toolExecution.executeTool(
        'list_data_source_operations',
        {},
        buildToolContext(m1bFixture.legacyApiCallSchema, 'agent-catalog-page'),
      );
      const operations = (result.data as { operations: unknown[] }).operations;
      expect(operations).toHaveLength(1);
      expect((operations[0] as { operationId: string }).operationId).toBe('demo.items.search');
      expect(result.warnings ?? []).toEqual([]);
    });

    it('未注入目录服务 → 空目录 + fail-close 警告', async () => {
      const { toolExecution } = buildToolServices(undefined);
      const result = await toolExecution.executeTool(
        'list_data_source_operations',
        {},
        buildToolContext(m1bFixture.legacyApiCallSchema, 'agent-catalog-page'),
      );
      expect((result.data as { operations: unknown[] }).operations).toEqual([]);
      expect(result.warnings?.some((w) => w.includes('fail-close'))).toBe(true);
    });

    it('上下文缺 pageId/版本 → 空目录 + 上下文警告', async () => {
      const catalog = new DataSourceCatalogService(new CatalogIdentityAdapter());
      const { toolExecution } = buildToolServices(catalog);
      const result = await toolExecution.executeTool(
        'list_data_source_operations',
        {},
        buildToolContext(m1bFixture.legacyApiCallSchema, undefined),
      );
      expect((result.data as { operations: unknown[] }).operations).toEqual([]);
      expect(result.warnings?.some((w) => w.includes('pageId'))).toBe(true);
    });

    it('默认身份（未配置页面级解析）→ 空目录（Unconfigured 继承 fail-close）', async () => {
      class UnconfiguredAdapter extends DataSourceIdentityAdapter {
        resolveIdentity(): undefined {
          return undefined;
        }
      }
      const catalog = new DataSourceCatalogService(new UnconfiguredAdapter());
      const { toolExecution } = buildToolServices(catalog);
      const result = await toolExecution.executeTool(
        'list_data_source_operations',
        {},
        buildToolContext(m1bFixture.legacyApiCallSchema, 'agent-catalog-page'),
      );
      expect((result.data as { operations: unknown[] }).operations).toEqual([]);
    });
  });

  describe('Agent patch 预览入口（previewValidatedPatch → requireSupportedPageSchema）', () => {
    it('legacy 策略 + 矩阵放行下 data-source patch 结果被 DATASOURCE_REQUIRES_OPERATION_ONLY 拒绝', async () => {
      const { toolExecution } = buildToolServices(undefined);
      // legacy 草稿（清掉既有 apiCall 事件，patch 只引入 dataSources → 纯 legacy 新能力路径；
      // 草稿保留 apiCall 的混用路径已由契约策略 spec 的 DATASOURCE_MIXED_API_CALL 覆盖）
      const legacyDraft = JSON.parse(JSON.stringify(m1bFixture.legacyApiCallSchema));
      for (const component of Object.values(legacyDraft.components ?? {})) {
        if (component && typeof component === 'object' && 'events' in component) {
          (component as { events?: unknown }).events = {};
        }
      }
      let caught: unknown;
      await withTestWindowAsync('legacy', async () => {
        try {
          await toolExecution.executeTool(
            'replace_page_logic',
            {
              logic: {
                states: { rows: [] },
                dataSources: {
                  searchItems: {
                    operationRef: { operationId: 'demo.items.search', revision: '1' },
                  },
                },
              },
            },
            buildToolContext(legacyDraft, 'patch-page'),
          );
        } catch (error) {
          caught = error;
        }
      });
      const message =
        (caught as { getResponse?: () => { message?: string } })?.getResponse?.()?.message ?? '';
      expect(message).toContain('operation-only');
    });
  });
});
