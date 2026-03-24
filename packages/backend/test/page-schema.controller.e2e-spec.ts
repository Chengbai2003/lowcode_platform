import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PageSchemaController } from '../src/modules/page-schema/page-schema.controller';
import { PageSchemaService } from '../src/modules/page-schema/page-schema.service';

describe('PageSchemaController (e2e)', () => {
  let app: INestApplication;
  let pageSchemaServiceMock: {
    saveSchema: jest.Mock;
    getSchema: jest.Mock;
  };
  const TEST_SECRET = 'test-secret';

  beforeEach(async () => {
    process.env.API_SECRET = TEST_SECRET;
    pageSchemaServiceMock = {
      saveSchema: jest.fn().mockResolvedValue({
        pageId: 'page-1',
        version: 2,
        snapshotId: 'snapshot-2',
        savedAt: '2026-03-18T00:00:00.000Z',
      }),
      getSchema: jest.fn().mockResolvedValue({
        pageId: 'page-1',
        version: 2,
        snapshotId: 'snapshot-2',
        savedAt: '2026-03-18T00:00:00.000Z',
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Button',
            },
          },
        },
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PageSchemaController],
      providers: [
        {
          provide: PageSchemaService,
          useValue: pageSchemaServiceMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'API_SECRET') {
                return TEST_SECRET;
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts PUT /pages/:pageId/schema with valid payload', () => {
    return request(app.getHttpServer())
      .put('/pages/page-1/schema')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Button',
            },
          },
        },
        baseVersion: 1,
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.version).toBe(2);
        expect(res.body.pageId).toBe('page-1');
      });
  });

  it('rejects PUT /pages/:pageId/schema when schema is missing', () => {
    return request(app.getHttpServer())
      .put('/pages/page-1/schema')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        baseVersion: 1,
      })
      .expect(400);
  });

  it('accepts GET /pages/:pageId/schema?version=2', () => {
    return request(app.getHttpServer())
      .get('/pages/page-1/schema?version=2')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.pageId).toBe('page-1');
        expect(res.body.version).toBe(2);
      });
  });

  it('rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/pages/page-1/schema').expect(401);
  });

  it('returns conflict when service reports version mismatch', () => {
    pageSchemaServiceMock.saveSchema.mockRejectedValueOnce(
      new ConflictException({
        message: 'Page version mismatch',
        expectedVersion: 2,
        receivedVersion: 1,
      }),
    );

    return request(app.getHttpServer())
      .put('/pages/page-1/schema')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Button',
            },
          },
        },
        baseVersion: 1,
      })
      .expect(409);
  });
});
