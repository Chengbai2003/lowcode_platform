import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { requireSupportedPageSchema, type PageSchema } from '@lowcode-platform/schema-contract';
import { PageSchemaRepository } from './page-schema.repository';

const runtimeCompatibility = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.0.0-draft',
  rendererVersion: '0.0.0-draft',
};

const createSchema = (label: string) => ({
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Button', props: { children: label } },
  },
});

describe('PageSchemaRepository', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'page-schema-test-'));
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

  it('双 Repository 同文件并发：一成功一 Conflict', async () => {
    const repoA = createRepo();
    const repoB = createRepo();
    await repoA.onModuleInit();
    await repoB.onModuleInit();

    const results = await Promise.allSettled([
      repoA.saveSchema({
        pageId: 'p-concurrent',
        systemId: 'default',
        schema: createSchema('a'),
        runtimeCompatibility,
      }),
      repoB.saveSchema({
        pageId: 'p-concurrent',
        systemId: 'default',
        schema: createSchema('b'),
        runtimeCompatibility,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // rejected should be ConflictException
    const reason = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(reason.name).toBe('ConflictException');

    // 只有一个版本写入，pageVersion 为 1
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages).toHaveLength(1);
    expect(onDisk.pages[0].currentPageVersion).toBe(1);
    expect(onDisk.snapshots).toHaveLength(1);

    // 任一 repo 内存应反映最新
    const winner = fulfilled[0] as PromiseFulfilledResult<{ page: { currentPageVersion: number } }>;
    expect(winner.value.page.currentPageVersion).toBe(1);
  });

  it('并发基于已存在版本：一成功一 Conflict（basePageVersion）', async () => {
    const repoA = createRepo();
    await repoA.onModuleInit();
    await repoA.saveSchema({
      pageId: 'p-exist',
      systemId: 'default',
      schema: createSchema('v1'),
      runtimeCompatibility,
    });

    const repoB = createRepo();
    const repoC = createRepo();
    await repoB.onModuleInit();
    await repoC.onModuleInit();

    const results = await Promise.allSettled([
      repoB.saveSchema({
        pageId: 'p-exist',
        systemId: 'default',
        schema: createSchema('v2a'),
        basePageVersion: 1,
        runtimeCompatibility,
      }),
      repoC.saveSchema({
        pageId: 'p-exist',
        systemId: 'default',
        schema: createSchema('v2b'),
        basePageVersion: 1,
        runtimeCompatibility,
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages[0].currentPageVersion).toBe(2);
    expect(onDisk.snapshots).toHaveLength(2);
  });

  it('快照按原样保存 canonical schema，不写入版本字段', async () => {
    const repo = createRepo();
    await repo.onModuleInit();

    const { snapshot } = await repo.saveSchema({
      pageId: 'p-pure',
      systemId: 'default',
      schema: createSchema('v1'),
      runtimeCompatibility,
    });

    // Schema 不含页面版本；版本只存在于快照元数据
    expect(snapshot.pageVersion).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(snapshot.schema, 'version')).toBe(false);
    expect(snapshot.schema.schemaVersion).toBe(0);
    expect(snapshot.runtimeCompatibility).toEqual(runtimeCompatibility);

    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(Object.prototype.hasOwnProperty.call(onDisk.snapshots[0].schema, 'version')).toBe(false);
  });

  it('round-trips declared Page Logic including ActionFlows through snapshots and disk reload', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    const logic = {
      states: { count: 1, profile: { name: 'Ada' } },
      computed: { label: 'state.profile.name + ":" + String(state.count)' },
      flows: {
        saveProfile: {
          steps: [{ type: 'setValue' as const, field: 'state.count', value: 2 }],
        },
      },
    };
    const schema: PageSchema = {
      ...createSchema('stateful'),
      logic,
    };

    const { snapshot } = await repo.saveSchema({
      pageId: 'p-stateful',
      systemId: 'default',
      schema,
      runtimeCompatibility,
    });

    expect(snapshot.schema.logic?.states).toEqual(logic.states);
    expect(snapshot.schema.logic?.computed).toEqual(logic.computed);
    expect(snapshot.schema.logic?.flows).toEqual(logic.flows);
    expect(Object.isFrozen(snapshot.schema.logic?.states?.profile)).toBe(true);
    expect(Object.isFrozen(snapshot.schema.logic?.computed)).toBe(true);

    const reloaded = createRepo();
    await reloaded.onModuleInit();
    expect(reloaded.getSnapshotByVersion('p-stateful', 1)?.schema.logic?.states).toEqual(
      logic.states,
    );
    expect(reloaded.getSnapshotByVersion('p-stateful', 1)?.schema.logic?.computed).toEqual(
      logic.computed,
    );
    expect(reloaded.getSnapshotByVersion('p-stateful', 1)?.schema.logic?.flows).toEqual(
      logic.flows,
    );
  });

  it('rename 失败内存不变（失败自动回滚）', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    await repo.saveSchema({
      pageId: 'p-rollback',
      systemId: 'default',
      schema: createSchema('v1'),
      runtimeCompatibility,
    });

    const beforePage = repo.getPage('p-rollback');
    expect(beforePage?.currentPageVersion).toBe(1);
    const beforeSnapCount = JSON.parse(await fs.promises.readFile(storePath, 'utf-8')).snapshots
      .length;

    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('mock rename failure'));

    await expect(
      repo.saveSchema({
        pageId: 'p-rollback',
        systemId: 'default',
        schema: createSchema('v2'),
        basePageVersion: 1,
        runtimeCompatibility,
      }),
    ).rejects.toThrow();

    // 内存未被污染
    expect(repo.getPage('p-rollback')?.currentPageVersion).toBe(1);
    expect(repo.getSnapshotByVersion('p-rollback', 2)).toBeUndefined();

    // 磁盘仍为旧状态
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages[0].currentPageVersion).toBe(1);
    expect(onDisk.snapshots).toHaveLength(beforeSnapCount);
  });

  it.each([
    ['空文件', '   '],
    ['pages非数组', JSON.stringify({ pages: {}, snapshots: [] })],
    ['snapshots非数组', JSON.stringify({ pages: [], snapshots: {} })],
    [
      'currentPageVersion非整数',
      JSON.stringify({
        pages: [
          {
            pageId: 'p1',
            currentPageVersion: 1.5,
            latestSnapshotId: 's1',
            createdAt: '',
            updatedAt: '',
          },
        ],
        snapshots: [
          {
            snapshotId: 's1',
            pageId: 'p1',
            pageVersion: 1.5,
            schema: {},
            runtimeCompatibility,
            createdAt: '',
          },
        ],
      }),
    ],
    [
      'latestSnapshotId悬空',
      JSON.stringify({
        pages: [
          {
            pageId: 'p1',
            currentPageVersion: 1,
            latestSnapshotId: 'missing',
            createdAt: '',
            updatedAt: '',
          },
        ],
        snapshots: [
          {
            snapshotId: 's1',
            pageId: 'p1',
            pageVersion: 1,
            schema: {},
            runtimeCompatibility,
            createdAt: '',
          },
        ],
      }),
    ],
    ['无效JSON', '{ not-json'],
  ])('损坏文件启动抛错：%s', async (_label, content) => {
    await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
    await fs.promises.writeFile(storePath, content, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow();
  });

  it('磁盘快照 Schema 损坏时启动 fail-close', async () => {
    const bad = JSON.stringify({
      pages: [
        {
          pageId: 'p1',
          systemId: 'default',
          currentPageVersion: 1,
          latestSnapshotId: 's1',
          createdAt: '',
          updatedAt: '',
        },
      ],
      snapshots: [
        {
          snapshotId: 's1',
          pageId: 'p1',
          pageVersion: 1,
          schema: { schemaVersion: 999, rootId: 'root', components: {} },
          runtimeCompatibility,
          createdAt: '',
        },
      ],
    });
    await fs.promises.writeFile(storePath, bad, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow(/corrupted.*schema invalid/is);
  });

  it('saveSchema 对非法 Schema fail-close（Repository 自身边界）', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    await expect(
      repo.saveSchema({
        pageId: 'p-invalid',
        systemId: 'default',
        schema: { rootId: 'root', components: {} } as never,
        runtimeCompatibility,
      }),
    ).rejects.toThrow();
    await expect(repo.getPage('p-invalid')).toBeUndefined();
  });

  it('runtimeCompatibility 缺失字段时 fail-close', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    await expect(
      repo.saveSchema({
        pageId: 'p-bad-compat',
        systemId: 'default',
        schema: createSchema('v1'),
        runtimeCompatibility: { componentPresetId: 'builtin-antd' } as never,
      }),
    ).rejects.toThrow(/runtimeCompatibility/);
  });

  it('旧格式 store（扁平 id 字段）给出明确清理指引，不做静默迁移', async () => {
    const legacy = JSON.stringify({
      pages: [
        { id: 'p1', currentVersion: 1, latestSnapshotId: 's1', createdAt: '', updatedAt: '' },
      ],
      snapshots: [{ id: 's1', pageId: 'p1', pageVersion: 1, schema: {}, createdAt: '' }],
    });
    await fs.promises.writeFile(storePath, legacy, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow(/legacy/i);
  });

  it('snapshot pageVersion 非整数也抛错', async () => {
    const bad = JSON.stringify({
      pages: [
        {
          pageId: 'p1',
          currentPageVersion: 1,
          latestSnapshotId: 's1',
          createdAt: '',
          updatedAt: '',
        },
      ],
      snapshots: [{ snapshotId: 's1', pageId: 'p1', pageVersion: '1', schema: {}, createdAt: '' }],
    });
    await fs.promises.writeFile(storePath, bad, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow();
  });

  describe('M1a-3 / C2.2 Repository real disk persistence and CAS round-trip conformance', () => {
    let suiteTmpDir: string;
    let suiteStorePath: string;

    function loadConformanceFixture() {
      const candidatePaths = [
        path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
        path.resolve(process.cwd(), 'test-fixtures/m1a-page-logic-conformance.json'),
      ];
      for (const candidatePath of candidatePaths) {
        if (fs.existsSync(candidatePath)) {
          return JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        }
      }
      throw new Error('Unable to locate test-fixtures/m1a-page-logic-conformance.json');
    }

    const conformanceFixture = loadConformanceFixture();

    function createConformanceCandidates() {
      const schemaA = requireSupportedPageSchema(conformanceFixture.schema);
      const candidateB: PageSchema = {
        ...schemaA,
        components: {
          ...schemaA.components,
          submit: {
            ...schemaA.components.submit,
            props: {
              ...schemaA.components.submit.props,
              children: 'Submit revised',
            },
          },
        },
      };
      const schemaB = requireSupportedPageSchema(candidateB);

      const candidateC: PageSchema = {
        ...schemaB,
        logic: {
          ...schemaB.logic!,
          states: {
            ...schemaB.logic!.states,
            price: 7,
          },
        },
      };
      const schemaC = requireSupportedPageSchema(candidateC);

      const legacySchema = requireSupportedPageSchema(conformanceFixture.legacySchema);

      return { schemaA, schemaB, schemaC, legacySchema };
    }

    beforeEach(async () => {
      suiteTmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'page-schema-conformance-'));
      suiteStorePath = path.join(suiteTmpDir, 'conformance-store.json');
      (
        PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
      ).writeTails?.clear?.();
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      (
        PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
      ).writeTails?.clear?.();
      await fs.promises.rm(suiteTmpDir, { recursive: true, force: true });
    });

    it('persists v1 (A) and v2 (C), proves history immutability and exact reload from distinct instance via onModuleInit', async () => {
      const { schemaA, schemaC } = createConformanceCandidates();
      const pageId = 'p-roundtrip-conformance';

      // 1. R1 init & save v1 (A)
      const r1 = createRepo(suiteStorePath);
      await r1.onModuleInit();

      const saveV1 = await r1.saveSchema({
        pageId,
        systemId: 'default',
        schema: schemaA,
        runtimeCompatibility,
      });
      expect(saveV1.page.currentPageVersion).toBe(1);
      expect(saveV1.snapshot.pageVersion).toBe(1);
      expect(saveV1.snapshot.schema).toEqual(schemaA);

      // 2. R1 save v2 (C with price=7) based on v1
      const saveV2 = await r1.saveSchema({
        pageId,
        systemId: 'default',
        schema: schemaC,
        basePageVersion: 1,
        runtimeCompatibility,
      });
      expect(saveV2.page.currentPageVersion).toBe(2);
      expect(saveV2.snapshot.pageVersion).toBe(2);
      expect(saveV2.snapshot.schema).toEqual(schemaC);

      // 3. In R1 memory: v1 history is immutable, latest is C
      const r1SnapV1 = r1.getSnapshotByVersion(pageId, 1);
      expect(r1SnapV1?.schema).toEqual(schemaA);
      expect(r1.getSnapshotByVersion(pageId, 2)?.schema).toEqual(schemaC);
      expect(r1.getLatestSnapshot(pageId)?.schema).toEqual(schemaC);

      // 4. Create distinct R2 instance with same file and onModuleInit (new-instance disk reload)
      const r2 = createRepo(suiteStorePath);
      await r2.onModuleInit();

      const r2Page = r2.getPage(pageId);
      expect(r2Page?.currentPageVersion).toBe(2);
      expect(r2Page?.systemId).toBe('default');

      const r2SnapV1 = r2.getSnapshotByVersion(pageId, 1);
      const r2SnapV2 = r2.getSnapshotByVersion(pageId, 2);
      const r2Latest = r2.getLatestSnapshot(pageId);

      // Full schema exactly preserved
      expect(r2SnapV1?.schema).toEqual(schemaA);
      expect(r2SnapV2?.schema).toEqual(schemaC);
      expect(r2Latest?.schema).toEqual(schemaC);

      // RuntimeCompatibility exactly preserved
      expect(r2SnapV1?.runtimeCompatibility).toEqual(runtimeCompatibility);
      expect(r2SnapV2?.runtimeCompatibility).toEqual(runtimeCompatibility);

      // schemaVersion is 0, storage metadata pageVersion/snapshotId/systemId absent from schema
      expect(r2Latest?.schema.schemaVersion).toBe(0);
      expect(Object.prototype.hasOwnProperty.call(r2Latest!.schema, 'pageVersion')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r2Latest!.schema, 'snapshotId')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r2Latest!.schema, 'systemId')).toBe(false);

      // Representative nested freeze after load
      expect(r2Latest?.schema).toBeDefined();
      expect(Object.isFrozen(r2Latest!.schema)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.components)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.components.root)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.components.submit)).toBe(true);
      expect(r2Latest!.schema.logic).toBeDefined();
      expect(Object.isFrozen(r2Latest!.schema.logic)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.logic?.states)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.logic?.computed)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.logic?.flows)).toBe(true);
      expect(Object.isFrozen(r2Latest!.schema.logic?.flows?.submitOrder)).toBe(true);
    });

    it('rejects stale CAS save with ConflictException, leaving disk snapshots, page pointers, and latest schema completely unchanged', async () => {
      const { schemaA, schemaC } = createConformanceCandidates();
      const pageId = 'p-cas-conformance';

      const r1 = createRepo(suiteStorePath);
      await r1.onModuleInit();

      await r1.saveSchema({
        pageId,
        systemId: 'default',
        schema: schemaA,
        runtimeCompatibility,
      });

      await r1.saveSchema({
        pageId,
        systemId: 'default',
        schema: schemaC,
        basePageVersion: 1,
        runtimeCompatibility,
      });

      const diskBefore = JSON.parse(await fs.promises.readFile(suiteStorePath, 'utf-8'));
      expect(diskBefore.pages[0].currentPageVersion).toBe(2);
      const snapshotCountBefore = diskBefore.snapshots.length;
      const latestSnapshotIdBefore = diskBefore.pages[0].latestSnapshotId;

      // Distinct instance R2 attempts stale CAS save based on v1 (current is 2)
      const r2 = createRepo(suiteStorePath);
      await r2.onModuleInit();

      let caughtError: unknown;
      try {
        await r2.saveSchema({
          pageId,
          systemId: 'default',
          schema: schemaA,
          basePageVersion: 1,
          runtimeCompatibility,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect((caughtError as { name: string }).name).toBe('ConflictException');

      // Assert disk snapshot count, page pointer/version and latest full schema unchanged on disk
      const diskAfter = JSON.parse(await fs.promises.readFile(suiteStorePath, 'utf-8'));
      expect(diskAfter).toEqual(diskBefore);
      expect(diskAfter.snapshots).toHaveLength(snapshotCountBefore);
      expect(diskAfter.pages[0].currentPageVersion).toBe(2);
      expect(diskAfter.pages[0].latestSnapshotId).toBe(latestSnapshotIdBefore);

      // Assert memory state in R2 also unchanged
      expect(r2.getPage(pageId)?.currentPageVersion).toBe(2);
      expect(r2.getLatestSnapshot(pageId)?.schema).toEqual(schemaC);
    });

    it('saves legacySchema, reloads from distinct disk instance, and preserves full equality without own logic property', async () => {
      const { legacySchema } = createConformanceCandidates();
      const legacyPageId = 'p-legacy-persistence';

      const r1 = createRepo(suiteStorePath);
      await r1.onModuleInit();

      await r1.saveSchema({
        pageId: legacyPageId,
        systemId: 'default',
        schema: legacySchema,
        runtimeCompatibility,
      });

      const r2 = createRepo(suiteStorePath);
      await r2.onModuleInit();

      const reloaded = r2.getLatestSnapshot(legacyPageId);
      expect(reloaded).toBeDefined();
      expect(reloaded?.schema).toEqual(legacySchema);
      expect(Object.prototype.hasOwnProperty.call(reloaded!.schema, 'logic')).toBe(false);
      expect(reloaded!.schema.logic).toBeUndefined();
      expect(reloaded!.schema.components['legacy-btn'].props?.children).toBe('Legacy Trigger');
      expect(Object.isFrozen(reloaded!.schema)).toBe(true);
      expect(Object.isFrozen(reloaded!.schema.components)).toBe(true);
    });
  });
});
