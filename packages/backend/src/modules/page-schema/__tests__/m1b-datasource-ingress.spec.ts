import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import * as contract from '@lowcode-platform/schema-contract';
import { PageSchemaService } from '../page-schema.service';
import { PageRuntimeMetadataProvider } from '../page-runtime-metadata.provider';
import { PageSchemaRepository } from '../repositories/page-schema.repository';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from '../runtime-profiles';

const m1bFixture = require('../../../../../../test-fixtures/m1b-datasource-conformance.json');
const m1aFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);
const policyModulePath = path.resolve(path.dirname(manifestModulePath), 'policy.js');
const policyModule = require(policyModulePath);

/**
 * M1b 与 M1a ingress 不同：data-source 在生产可信清单中真实为 unsupported，
 * 拒绝测试直接使用生产清单，不临时屏蔽能力。
 * 该 helper 仅用于"磁盘重载"入口的样本构造阶段：临时以测试矩阵放行
 * data-source 以便把含声明的快照写进磁盘，随后在真实清单下验证加载 fail-close。
 */
async function withSupportedDataSourceAsync<T>(fn: () => Promise<T>): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of contract.CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
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

describe('Page Schema Ingress: data-source default-deny (M1b-1 PR A / Refs #64)', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'm1b-datasource-ingress-'));
    storePath = path.join(tmpDir, 'store.json');
    (
      PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
    ).writeTails?.clear?.();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    (
      PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
    ).writeTails?.clear?.();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  function createRepo(p = storePath): PageSchemaRepository {
    const repo = new PageSchemaRepository();
    (repo as unknown as { storeFilePath: string }).storeFilePath = p;
    return repo;
  }

  describe('entrance 1: PageSchemaService.saveSchema（生产清单，无任何屏蔽）', () => {
    it('rejects structurally-legal data-source schema with 400 CAPABILITY_UNSUPPORTED on all 6 surfaces and never touches repository', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);
      const repoSaveSpy = jest.spyOn(repo, 'saveSchema');

      let caughtError: unknown;
      try {
        await service.saveSchema({
          pageId: 'm1b-page-blocked',
          schema: m1bFixture.schema,
        });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const badRequest = caughtError as BadRequestException;
      expect(badRequest.getStatus()).toBe(400);

      const response = badRequest.getResponse() as {
        message: string;
        issues: Array<{ code: string; path: string[]; message: string }>;
      };
      expect(response.message).toContain('Schema validation failed');
      expect(response.issues).toHaveLength(contract.CONSUMER_SURFACES.length);
      for (const issue of response.issues) {
        expect(issue.code).toBe('CAPABILITY_UNSUPPORTED');
        expect(issue.path).toEqual(['logic', 'dataSources']);
        expect(issue.message).toContain('data-source');
      }
      // 六个消费面逐面点名
      const surfaceNames = response.issues
        .map((i) => contract.CONSUMER_SURFACES.find((s) => i.message.includes(s)))
        .filter(Boolean);
      expect(new Set(surfaceNames)).toEqual(new Set([...contract.CONSUMER_SURFACES]));

      expect(repoSaveSpy).not.toHaveBeenCalled();
    });

    it('legacy apiCall schema (no logic capabilities) still saves under the production manifest（旧动作不退化）', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);

      const saved = await service.saveSchema({
        pageId: 'm1b-legacy-apicall',
        schema: m1bFixture.legacyApiCallSchema,
      });
      expect(saved.pageVersion).toBe(1);
    });

    it('pre-existing M1a conformance schema still saves and reloads（既有能力不退化）', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);

      const saved = await service.saveSchema({
        pageId: 'm1b-m1a-regression',
        schema: m1aFixture.schema,
      });
      expect(saved.pageVersion).toBe(1);
      const loaded = await service.getSchema('m1b-m1a-regression');
      expect(loaded.schema.logic?.states).toBeDefined();
    });
  });

  describe('entrance 2: PageSchemaRepository 直接 saveSchema（生产清单）', () => {
    it('rejects data-source schema; disk bytes, version pointer and snapshots unchanged', async () => {
      const repo = createRepo();
      await repo.onModuleInit();

      // 先用 M1a 语料成功保存版本 1（不含 data-source，正常清单可存）
      await repo.saveSchema({
        pageId: 'page-repo-m1b',
        schema: m1aFixture.schema,
        systemId: 'default',
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      const rawBefore = fs.readFileSync(storePath, 'utf8');
      expect(repo.getPage('page-repo-m1b')?.currentPageVersion).toBe(1);

      let saveError: unknown;
      try {
        await repo.saveSchema({
          pageId: 'page-repo-m1b',
          schema: m1bFixture.schema,
          basePageVersion: 1,
          systemId: 'default',
          runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
        });
      } catch (err) {
        saveError = err;
      }

      expect(saveError).toBeDefined();
      expect((saveError as Error).message).toContain('Page schema store is corrupted');
      expect((saveError as Error).message).toContain('data-source');

      // 副作用断言：磁盘字节不变、版本指针未推进、无新快照
      expect(fs.readFileSync(storePath, 'utf8')).toBe(rawBefore);
      expect(repo.getPage('page-repo-m1b')?.currentPageVersion).toBe(1);
      expect(repo.getSnapshotByVersion('page-repo-m1b', 2)).toBeUndefined();
    });
  });

  describe('entrance 3: PageSchemaRepository 新实例磁盘加载（生产清单）', () => {
    it('fails closed loading a stored data-source snapshot; disk unchanged; structurally reloadable once capability is granted', async () => {
      // 1. 仅在"构造阶段"临时放行 data-source，把含声明的快照写入磁盘
      await withSupportedDataSourceAsync(async () => {
        const repoSeed = createRepo();
        await repoSeed.onModuleInit();
        await repoSeed.saveSchema({
          pageId: 'page-reload-m1b',
          schema: m1bFixture.schema,
          systemId: 'default',
          runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
        });
      });

      const rawBefore = fs.readFileSync(storePath, 'utf8');
      expect(rawBefore.length).toBeGreaterThan(0);

      // 2. 真实生产清单下新实例加载：fail-close，磁盘字节不变
      const repoLoad = createRepo(storePath);
      let loadError: unknown;
      try {
        await repoLoad.onModuleInit();
      } catch (err) {
        loadError = err;
      }
      expect(loadError).toBeDefined();
      expect((loadError as Error).message).toContain('Page schema store is corrupted');
      expect((loadError as Error).message).toContain('data-source');
      expect(fs.readFileSync(storePath, 'utf8')).toBe(rawBefore);

      // 3. 控制组：同一磁盘文件在测试矩阵放行后可完整恢复（证明拒绝纯粹来自能力门禁，
      //    而非字节损坏；这模拟 B/C/D/E 交付后六面放行的未来状态）
      await withSupportedDataSourceAsync(async () => {
        const repoOk = createRepo(storePath);
        await repoOk.onModuleInit();
        const snapshot = repoOk.getLatestSnapshot('page-reload-m1b');
        expect(snapshot?.schema.logic?.dataSources).toBeDefined();
      });
    });
  });
});
