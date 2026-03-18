import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PageSchemaService } from './page-schema.service';
import {
  PageRecord,
  PageSchemaRepository,
  PageSchemaSnapshotRecord,
} from './repositories/page-schema.repository';

const createSchema = (label: string) => ({
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

const getRootLabel = (schema: Record<string, unknown>) => {
  const components = schema.components as Record<string, { props?: { children?: string } }>;
  return components.root?.props?.children;
};

describe('PageSchemaService', () => {
  let service: PageSchemaService;
  let repository: jest.Mocked<PageSchemaRepository>;
  let pageStore: PageRecord | undefined;
  let snapshots: PageSchemaSnapshotRecord[] = [];

  beforeEach(async () => {
    pageStore = undefined;
    snapshots = [];

    const repositoryMock: jest.Mocked<PageSchemaRepository> = {
      onModuleInit: jest.fn(),
      getPage: jest.fn((pageId: string) => (pageStore?.id === pageId ? pageStore : undefined)),
      getLatestSnapshot: jest.fn((pageId: string) =>
        snapshots.find(
          (snapshot) => snapshot.pageId === pageId && snapshot.id === pageStore?.latestSnapshotId,
        ),
      ),
      getSnapshotByVersion: jest.fn((pageId: string, version: number) =>
        snapshots.find((snapshot) => snapshot.pageId === pageId && snapshot.version === version),
      ),
      saveSnapshot: jest.fn((snapshot: PageSchemaSnapshotRecord, page: PageRecord) => {
        pageStore = page;
        snapshots.push(snapshot);
      }),
    } as unknown as jest.Mocked<PageSchemaRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageSchemaService,
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
    const result = await service.saveSchema('page-1', {
      schema: createSchema('first'),
    });

    expect(result.pageId).toBe('page-1');
    expect(result.version).toBe(1);
    expect(repository.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        version: 1,
        schema: {
          ...createSchema('first'),
          version: 1,
        },
      }),
      expect.objectContaining({
        id: 'page-1',
        currentVersion: 1,
      }),
    );
  });

  it('increments the version when saving the same page again', async () => {
    await service.saveSchema('page-1', {
      schema: createSchema('first'),
    });

    const result = await service.saveSchema('page-1', {
      schema: createSchema('second'),
      baseVersion: 1,
    });

    expect(result.version).toBe(2);
    expect(pageStore?.currentVersion).toBe(2);
  });

  it('throws conflict when baseVersion is stale', async () => {
    await service.saveSchema('page-1', {
      schema: createSchema('first'),
    });

    await expect(
      service.saveSchema('page-1', {
        schema: createSchema('stale'),
        baseVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('loads the latest or versioned snapshot', async () => {
    await service.saveSchema('page-1', {
      schema: createSchema('first'),
    });
    await service.saveSchema('page-1', {
      schema: createSchema('second'),
      baseVersion: 1,
    });

    const latest = await service.getSchema('page-1');
    const v1 = await service.getSchema('page-1', 1);

    expect(latest.version).toBe(2);
    expect(latest.schema.version).toBe(2);
    expect(getRootLabel(latest.schema)).toBe('second');
    expect(v1.version).toBe(1);
    expect(v1.schema.version).toBe(1);
    expect(getRootLabel(v1.schema)).toBe('first');
  });

  it('throws not found when page does not exist', async () => {
    await expect(service.getSchema('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
