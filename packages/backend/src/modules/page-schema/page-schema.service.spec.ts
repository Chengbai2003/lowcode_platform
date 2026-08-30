import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PageSchemaService } from './page-schema.service';
import { PageRuntimeMetadataProvider } from './page-runtime-metadata.provider';
import {
  StoredPageRecord,
  PageSchemaRepository,
  PageSnapshotRecord,
} from './repositories/page-schema.repository';

const runtimeCompatibility = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.0.0-draft',
  rendererVersion: '0.0.0-draft',
};

const createSchema = (label: string) => ({
  schemaVersion: 0 as const,
  rootId: 'root',
  components: {
    root: {
      id: 'root',
      type: 'Button',
      props: {
        children: label,
      },
    },
  },
});

const getRootLabel = (schema: { components: Record<string, { props?: { children?: string } }> }) =>
  schema.components.root?.props?.children;

describe('PageSchemaService', () => {
  let service: PageSchemaService;
  let repository: jest.Mocked<PageSchemaRepository>;
  let pageStore: StoredPageRecord | undefined;
  let snapshots: PageSnapshotRecord[] = [];

  beforeEach(async () => {
    pageStore = undefined;
    snapshots = [];

    const repositoryMock: jest.Mocked<PageSchemaRepository> = {
      onModuleInit: jest.fn(),
      getPage: jest.fn((pageId: string) => (pageStore?.pageId === pageId ? pageStore : undefined)),
      getLatestSnapshot: jest.fn((pageId: string) =>
        snapshots.find(
          (snapshot) =>
            snapshot.pageId === pageId && snapshot.snapshotId === pageStore?.latestSnapshotId,
        ),
      ),
      getSnapshotByVersion: jest.fn((pageId: string, pageVersion: number) =>
        snapshots.find(
          (snapshot) => snapshot.pageId === pageId && snapshot.pageVersion === pageVersion,
        ),
      ),
      saveSchema: jest.fn(
        async (params: {
          pageId: string;
          schema: PageSnapshotRecord['schema'];
          basePageVersion?: number;
          runtimeCompatibility: typeof runtimeCompatibility;
        }) => {
          const currentPageVersion = pageStore?.currentPageVersion ?? 0;
          if (pageStore && params.basePageVersion === undefined) {
            throw new ConflictException({
              message: 'Page version mismatch',
              pageId: params.pageId,
              expectedVersion: currentPageVersion,
              receivedVersion: null,
            });
          }
          if (
            params.basePageVersion !== undefined &&
            params.basePageVersion !== currentPageVersion
          ) {
            throw new ConflictException({
              message: 'Page version mismatch',
              pageId: params.pageId,
              expectedVersion: currentPageVersion,
              receivedVersion: params.basePageVersion,
            });
          }
          const nextPageVersion = currentPageVersion + 1;
          const snapshotId = `mock-${params.pageId}-v${nextPageVersion}-${Date.now()}`;
          const snap: PageSnapshotRecord = {
            snapshotId,
            pageId: params.pageId,
            pageVersion: nextPageVersion,
            // 与真实 Repository 一致：按原样保存传入的 schema，不注入版本
            schema: params.schema,
            runtimeCompatibility: params.runtimeCompatibility,
            createdAt: new Date().toISOString(),
          };
          const page: StoredPageRecord = {
            pageId: params.pageId,
            currentPageVersion: nextPageVersion,
            latestSnapshotId: snapshotId,
            createdAt: pageStore?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          pageStore = page;
          snapshots.push(snap);
          return { page, snapshot: snap };
        },
      ),
    } as unknown as jest.Mocked<PageSchemaRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageSchemaService,
        PageRuntimeMetadataProvider,
        {
          provide: PageSchemaRepository,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get(PageSchemaService);
    repository = module.get(PageSchemaRepository);
  });

  it('saves a new page at version 1', async () => {
    const result = await service.saveSchema({ pageId: 'page-1', schema: createSchema('first') });

    expect(result.pageId).toBe('page-1');
    expect(result.pageVersion).toBe(1);
    expect(repository.saveSchema).toHaveBeenCalledTimes(1);
    expect(repository.saveSchema).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        basePageVersion: undefined,
        runtimeCompatibility,
      }),
    );
  });

  it('saves the canonical deep-frozen schema, not the original input', async () => {
    const original: unknown = createSchema('first');
    await service.saveSchema({ pageId: 'page-1', schema: original });

    const savedWith = repository.saveSchema.mock.calls[0][0];
    // canonical 与原输入内容等价，但是深冻结的独立对象
    expect(savedWith.schema).toEqual(original);
    expect(savedWith.schema).not.toBe(original);
    expect(Object.isFrozen(savedWith.schema)).toBe(true);
    expect(Object.isFrozen(savedWith.schema.components.root)).toBe(true);
    expect(savedWith.schema.schemaVersion).toBe(0);
  });

  it('rejects invalid schema with 400 before touching the repository', async () => {
    const invalid = { rootId: '', components: {} };

    await expect(service.saveSchema({ pageId: 'page-1', schema: invalid })).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.saveSchema).not.toHaveBeenCalled();
  });

  it('increments the version when saving the same page again', async () => {
    await service.saveSchema({ pageId: 'page-1', schema: createSchema('first') });

    const result = await service.saveSchema({
      pageId: 'page-1',
      schema: createSchema('second'),
      basePageVersion: 1,
    });

    expect(result.pageVersion).toBe(2);
    expect(pageStore?.currentPageVersion).toBe(2);
  });

  it('throws conflict when basePageVersion is stale', async () => {
    await service.saveSchema({ pageId: 'page-1', schema: createSchema('first') });

    await expect(
      service.saveSchema({
        pageId: 'page-1',
        schema: createSchema('stale'),
        basePageVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('loads the latest or versioned snapshot with a pure schema', async () => {
    await service.saveSchema({ pageId: 'page-1', schema: createSchema('first') });
    await service.saveSchema({
      pageId: 'page-1',
      schema: createSchema('second'),
      basePageVersion: 1,
    });

    const latest = await service.getSchema('page-1');
    const v1 = await service.getSchema('page-1', 1);

    expect(latest.pageVersion).toBe(2);
    // Schema 是纯数据：不含页面 version，只含 DSL 格式版本
    expect(Object.prototype.hasOwnProperty.call(latest.schema, 'version')).toBe(false);
    expect(latest.schema.schemaVersion).toBe(0);
    expect(getRootLabel(latest.schema)).toBe('second');
    expect(v1.pageVersion).toBe(1);
    expect(v1.schema.schemaVersion).toBe(0);
    expect(getRootLabel(v1.schema)).toBe('first');
  });

  it('throws not found when page does not exist', async () => {
    await expect(service.getSchema('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
