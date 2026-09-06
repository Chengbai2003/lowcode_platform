import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import * as contract from '@lowcode-platform/schema-contract';
import { PageSchemaService } from '../page-schema.service';
import { PageRuntimeMetadataProvider } from '../page-runtime-metadata.provider';
import { PageSchemaRepository } from '../repositories/page-schema.repository';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from '../runtime-profiles';

const conformanceFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

async function withBlockedCapabilityAsync<T>(
  capability: 'page-state' | 'named-computed' | 'action-flow',
  surface: 'contract' | 'validator' | 'editor-agent' | 'renderer' | 'compiler' | 'storage',
  fn: () => Promise<T>,
): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({
      [capability]: { [surface]: { status: 'unsupported', revision: 1 } },
    }),
  });
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
  }
}

describe('Page Schema Ingress Capability Gates (C3b / Issue #47)', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'page-schema-ingress-test-'));
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

  describe('1. PageSchemaService.saveSchema', () => {
    it('rejects blocked schema with 400 BadRequestException and does not invoke repository.saveSchema', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);

      const repoSaveSpy = jest.spyOn(repo, 'saveSchema');

      await withBlockedCapabilityAsync('page-state', 'storage', async () => {
        let caughtError: unknown;
        try {
          await service.saveSchema({
            pageId: 'test-page-blocked',
            schema: conformanceFixture.schema,
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
        expect(response.issues).toBeDefined();
        expect(response.issues.length).toBeGreaterThan(0);
        expect(response.issues[0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(response.issues[0].path).toEqual(['logic', 'states']);
        expect(response.issues[0].message).toContain('storage');

        // 副作用断言：下层 repository.saveSchema 未被调用
        expect(repoSaveSpy).not.toHaveBeenCalled();
      });
    });

    it('saves fixed conformance corpus normally and client cannot control server runtime triplet', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);

      // 客户端传入合法的固定语料
      const saved = await service.saveSchema({
        pageId: 'test-page-ok',
        schema: conformanceFixture.schema,
      });

      expect(saved.pageId).toBe('test-page-ok');
      expect(saved.pageVersion).toBe(1);
      expect(typeof saved.snapshotId).toBe('string');
      expect(typeof saved.savedAt).toBe('string');

      // 从服务端读取，证明存储的 runtimeCompatibility 严格来自服务端可信 metadataProvider，
      // 客户端不能伪造或控制
      const loaded = await service.getSchema('test-page-ok');
      expect(loaded.pageVersion).toBe(1);
      expect(loaded.runtimeCompatibility).toEqual(
        metadataProvider.getDraftPageRuntimeMetadata().runtimeCompatibility,
      );
      expect(loaded.schema.logic?.states).toBeDefined();
    });

    it('allows legacy schema without logic to save even when logic capabilities are blocked', async () => {
      const repo = createRepo();
      await repo.onModuleInit();
      const metadataProvider = new PageRuntimeMetadataProvider();
      const service = new PageSchemaService(repo, metadataProvider);

      await withBlockedCapabilityAsync('page-state', 'storage', async () => {
        const saved = await service.saveSchema({
          pageId: 'test-legacy-ok',
          schema: conformanceFixture.legacySchema,
        });
        expect(saved.pageId).toBe('test-legacy-ok');
        expect(saved.pageVersion).toBe(1);
      });
    });
  });

  describe('2. PageSchemaRepository 直接 saveSchema', () => {
    it('rejects blocked schema on real disk file; byte content, snapshot count, and version pointer remain unchanged', async () => {
      const repo = createRepo();
      await repo.onModuleInit();

      // 先成功保存版本 1
      await repo.saveSchema({
        pageId: 'page-repo-test',
        schema: conformanceFixture.schema,
        systemId: 'default',
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      const rawBefore = fs.readFileSync(storePath, 'utf8');
      const pageBefore = repo.getPage('page-repo-test');
      expect(pageBefore?.currentPageVersion).toBe(1);
      const snapshotV1Before = repo.getSnapshotByVersion('page-repo-test', 1);
      expect(snapshotV1Before).toBeDefined();

      // 在 storage 屏蔽 named-computed 的情况下直接调用 repo.saveSchema 保存下一个版本
      await withBlockedCapabilityAsync('named-computed', 'storage', async () => {
        let saveError: unknown;
        try {
          await repo.saveSchema({
            pageId: 'page-repo-test',
            schema: conformanceFixture.schema,
            basePageVersion: 1,
            systemId: 'default',
            runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
          });
        } catch (err) {
          saveError = err;
        }

        expect(saveError).toBeDefined();
        expect((saveError as Error).message).toContain('Page schema store is corrupted');
        expect((saveError as Error).message).toContain(
          'is unsupported by consumer surface "storage"',
        );
        expect((saveError as Error).message).toContain('named-computed');
      });

      // 副作用断言：磁盘字节完全不变、版本指针未增加、快照数量未变
      const rawAfter = fs.readFileSync(storePath, 'utf8');
      expect(rawAfter).toBe(rawBefore);
      const pageAfter = repo.getPage('page-repo-test');
      expect(pageAfter?.currentPageVersion).toBe(1);
      expect(repo.getSnapshotByVersion('page-repo-test', 2)).toBeUndefined();
    });

    it('normal CAS save succeeds and matches historical snapshot fields', async () => {
      const repo = createRepo();
      await repo.onModuleInit();

      const res1 = await repo.saveSchema({
        pageId: 'page-cas-test',
        schema: conformanceFixture.schema,
        systemId: 'default',
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      const res2 = await repo.saveSchema({
        pageId: 'page-cas-test',
        schema: conformanceFixture.schema,
        basePageVersion: 1,
        systemId: 'default',
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      expect(res1.page.currentPageVersion).toBe(1);
      expect(res2.page.currentPageVersion).toBe(2);

      const snap1 = repo.getSnapshotByVersion('page-cas-test', 1);
      const snap2 = repo.getSnapshotByVersion('page-cas-test', 2);
      expect(snap1?.pageVersion).toBe(1);
      expect(snap2?.pageVersion).toBe(2);
      expect(snap1?.schema.logic).toEqual(snap2?.schema.logic);
    });
  });

  describe('3. PageSchemaRepository 新实例磁盘加载', () => {
    it('saves valid schema under normal manifest, rejects loading under blocked manifest with corrupted store error, disk bytes unchanged', async () => {
      // 1. 在正常 manifest 下保存包含 action-flow 的 schema
      const repo1 = createRepo();
      await repo1.onModuleInit();
      await repo1.saveSchema({
        pageId: 'page-reload-test',
        schema: conformanceFixture.schema,
        systemId: 'default',
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      const rawBefore = fs.readFileSync(storePath, 'utf8');
      expect(rawBefore.length).toBeGreaterThan(0);

      // 2. 在 action-flow 对 storage 屏蔽的隔离环境下创建新 Repository 实例加载该磁盘文件
      await withBlockedCapabilityAsync('action-flow', 'storage', async () => {
        const repo2 = createRepo(storePath);
        let loadError: unknown;
        try {
          await repo2.onModuleInit();
        } catch (err) {
          loadError = err;
        }

        expect(loadError).toBeDefined();
        expect((loadError as Error).message).toContain('Page schema store is corrupted');
        expect((loadError as Error).message).toContain(
          'is unsupported by consumer surface "storage"',
        );
        expect((loadError as Error).message).toContain('action-flow');
      });

      // 副作用断言：加载失败后磁盘字节绝对未被改写或截断
      const rawAfter = fs.readFileSync(storePath, 'utf8');
      expect(rawAfter).toBe(rawBefore);

      // 3. 证明在正常 manifest 下新实例能完整恢复快照版本与内容（不宣称独立 OS 进程恢复）
      const repo3 = createRepo(storePath);
      await repo3.onModuleInit();
      expect(repo3.getPage('page-reload-test')?.currentPageVersion).toBe(1);
      const snapshot = repo3.getLatestSnapshot('page-reload-test');
      expect(snapshot?.pageVersion).toBe(1);
      expect(snapshot?.schema.logic?.flows).toBeDefined();
    });
  });
});
