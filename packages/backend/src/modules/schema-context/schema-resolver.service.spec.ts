import { BadRequestException } from '@nestjs/common';
import { SchemaResolverService } from './schema-resolver.service';
import { PageSchemaService } from '../page-schema/page-schema.service';

describe('SchemaResolverService', () => {
  let service: SchemaResolverService;
  let mockPageSchemaService: jest.Mocked<Pick<PageSchemaService, 'getSchema'>>;

  const validSchema = {
    rootId: 'root',
    version: 1,
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['child1'] },
      child1: { id: 'child1', type: 'Button', props: { children: 'Click' } },
    },
  };

  beforeEach(() => {
    mockPageSchemaService = {
      getSchema: jest.fn(),
    };
    service = new SchemaResolverService(mockPageSchemaService as any);
  });

  it('prefers draftSchema over pageId', async () => {
    const result = await service.resolve({
      pageId: 'page1',
      draftSchema: validSchema as any,
    });
    expect(result.rootId).toBe('root');
    expect(mockPageSchemaService.getSchema).not.toHaveBeenCalled();
  });

  it('loads from pageId when no draftSchema', async () => {
    mockPageSchemaService.getSchema.mockResolvedValue({
      pageId: 'page1',
      version: 1,
      snapshotId: 'snap1',
      schema: validSchema as any,
      savedAt: new Date().toISOString(),
    });
    const result = await service.resolve({ pageId: 'page1' });
    expect(result.rootId).toBe('root');
    expect(mockPageSchemaService.getSchema).toHaveBeenCalledWith('page1', undefined);
  });

  it('throws when neither draftSchema nor pageId provided', async () => {
    await expect(service.resolve({})).rejects.toThrow(BadRequestException);
  });

  it('throws on invalid schema structure', async () => {
    await expect(service.resolve({ draftSchema: { foo: 'bar' } })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns immutable copy via structuredClone', async () => {
    const draft = { ...validSchema } as any;
    const result = await service.resolve({ draftSchema: draft });
    expect(result).not.toBe(draft);
    expect(result.rootId).toBe('root');
  });

  it('throws when component id mismatches its key', async () => {
    await expect(
      service.resolve({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'other', type: 'Page' },
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when childrenIds contains non-string entries', async () => {
    await expect(
      service.resolve({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: [123] },
          },
        } as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
