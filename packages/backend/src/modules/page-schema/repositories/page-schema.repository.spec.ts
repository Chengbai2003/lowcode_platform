import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageSchemaRepository } from './page-schema.repository';

const createSchema = (label: string) => ({
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
      repoA.saveSchema({ pageId: 'p-concurrent', schema: createSchema('a') }),
      repoB.saveSchema({ pageId: 'p-concurrent', schema: createSchema('b') }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // rejected should be ConflictException
    const reason = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(reason.name).toBe('ConflictException');

    // 只有一个版本写入，version 为 1
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages).toHaveLength(1);
    expect(onDisk.pages[0].currentVersion).toBe(1);
    expect(onDisk.snapshots).toHaveLength(1);

    // 任一 repo 内存应反映最新
    const winner = fulfilled[0] as PromiseFulfilledResult<{ page: { currentVersion: number } }>;
    expect(winner.value.page.currentVersion).toBe(1);
  });

  it('并发基于已存在版本：一成功一 Conflict（baseVersion）', async () => {
    const repoA = createRepo();
    await repoA.onModuleInit();
    await repoA.saveSchema({ pageId: 'p-exist', schema: createSchema('v1') });

    const repoB = createRepo();
    const repoC = createRepo();
    await repoB.onModuleInit();
    await repoC.onModuleInit();

    const results = await Promise.allSettled([
      repoB.saveSchema({ pageId: 'p-exist', schema: createSchema('v2a'), baseVersion: 1 }),
      repoC.saveSchema({ pageId: 'p-exist', schema: createSchema('v2b'), baseVersion: 1 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages[0].currentVersion).toBe(2);
    expect(onDisk.snapshots).toHaveLength(2);
  });

  it('rename 失败内存不变（失败自动回滚）', async () => {
    const repo = createRepo();
    await repo.onModuleInit();
    await repo.saveSchema({ pageId: 'p-rollback', schema: createSchema('v1') });

    const beforePage = repo.getPage('p-rollback');
    expect(beforePage?.currentVersion).toBe(1);
    const beforeSnapCount = JSON.parse(await fs.promises.readFile(storePath, 'utf-8')).snapshots
      .length;

    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('mock rename failure'));

    await expect(
      repo.saveSchema({ pageId: 'p-rollback', schema: createSchema('v2'), baseVersion: 1 }),
    ).rejects.toThrow();

    // 内存未被污染
    expect(repo.getPage('p-rollback')?.currentVersion).toBe(1);
    expect(repo.getSnapshotByVersion('p-rollback', 2)).toBeUndefined();

    // 磁盘仍为旧状态
    const onDisk = JSON.parse(await fs.promises.readFile(storePath, 'utf-8'));
    expect(onDisk.pages[0].currentVersion).toBe(1);
    expect(onDisk.snapshots).toHaveLength(beforeSnapCount);
  });

  it.each([
    ['空文件', '   '],
    ['pages非数组', JSON.stringify({ pages: {}, snapshots: [] })],
    ['snapshots非数组', JSON.stringify({ pages: [], snapshots: {} })],
    [
      'version非整数',
      JSON.stringify({
        pages: [
          { id: 'p1', currentVersion: 1.5, latestSnapshotId: 's1', createdAt: '', updatedAt: '' },
        ],
        snapshots: [{ id: 's1', pageId: 'p1', version: 1.5, schema: {}, createdAt: '' }],
      }),
    ],
    [
      'latestSnapshotId悬空',
      JSON.stringify({
        pages: [
          {
            id: 'p1',
            currentVersion: 1,
            latestSnapshotId: 'missing',
            createdAt: '',
            updatedAt: '',
          },
        ],
        snapshots: [{ id: 's1', pageId: 'p1', version: 1, schema: {}, createdAt: '' }],
      }),
    ],
    ['无效JSON', '{ not-json'],
  ])('损坏文件启动抛错：%s', async (_label, content) => {
    await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
    await fs.promises.writeFile(storePath, content, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow();
  });

  it('snapshot version 非整数也抛错', async () => {
    const bad = JSON.stringify({
      pages: [
        { id: 'p1', currentVersion: 1, latestSnapshotId: 's1', createdAt: '', updatedAt: '' },
      ],
      snapshots: [{ id: 's1', pageId: 'p1', version: '1', schema: {}, createdAt: '' }],
    });
    await fs.promises.writeFile(storePath, bad, 'utf-8');
    const repo = createRepo();
    await expect(repo.onModuleInit()).rejects.toThrow();
  });
});
