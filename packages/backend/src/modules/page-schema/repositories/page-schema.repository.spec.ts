import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageSchemaRepository } from './page-schema.repository';

const runtimeCompatibility = {
  systemId: 'default',
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
        schema: createSchema('a'),
        runtimeCompatibility,
      }),
      repoB.saveSchema({
        pageId: 'p-concurrent',
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

  it('并发基于已存在版本：一成功一 Conflict（baseVersion）', async () => {
    const repoA = createRepo();
    await repoA.onModuleInit();
    await repoA.saveSchema({
      pageId: 'p-exist',
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
        schema: createSchema('v2a'),
        basePageVersion: 1,
        runtimeCompatibility,
      }),
      repoC.saveSchema({
        pageId: 'p-exist',
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

  it('rename 失败内存不变（失败自动回滚）', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    await repo.saveSchema({
      pageId: 'p-rollback',
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
});
