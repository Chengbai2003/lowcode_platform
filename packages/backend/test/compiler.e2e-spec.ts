import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CompilerController } from '../src/modules/compiler/compiler.controller';
import { CompilerService } from '../src/modules/compiler/compiler.service';
import { PageSchemaService } from '../src/modules/page-schema/page-schema.service';

describe('Compiler (e2e security & contract boundaries)', () => {
  let app: INestApplication;
  const TEST_SECRET = 'test-secret';
  const validOptions = { pageId: 'page-1', pageVersion: 1 };
  const pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema'> = {
    getSchema: jest.fn(async (pageId: string) => ({
      pageId,
      pageVersion: 1,
      snapshotId: 'snapshot-1',
      savedAt: '2026-01-01T00:00:00.000Z',
      schema: {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
      } as const,
      runtimeCompatibility: {
        componentPresetId: pageId === 'unknown-preset-page' ? 'unknown-preset' : 'builtin-antd',
        componentPresetVersion: ['legacy-draft-page', 'preset-version-mismatch-page'].includes(
          pageId,
        )
          ? '0.0.0-draft'
          : '0.1.0',
        rendererVersion: ['legacy-draft-page', 'renderer-version-mismatch-page'].includes(pageId)
          ? '0.0.0-draft'
          : '1.0.0',
      },
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.API_SECRET = TEST_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CompilerController],
      providers: [
        CompilerService,
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
    await app.close();
  });

  it('GET /compiler/health returns ok status', async () => {
    const response = await request(app.getHttpServer())
      .get('/compiler/health')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', service: 'compiler' });
  });

  it('POST /compiler/export 拒绝非法 schemaVersion 或畸形 Schema（fail-close，返回 HTTP 400）', async () => {
    const invalidSchemaBody = {
      schema: {
        schemaVersion: 999, // 非法版本号
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: [] },
        },
      },
      options: validOptions,
    };

    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send(invalidSchemaBody)
      .expect(400);

    expect(response.body.message).toMatch(/Invalid A2UI Page Schema|schemaVersion/i);
  });

  it('POST /compiler/export 拒绝缺失 schema 的请求（返回 HTTP 400）', async () => {
    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({})
      .expect(400);

    expect(response.status).toBe(400);
  });

  it('POST /compiler/export 正确编译规范 Schema 并采用服务端可信预设导入', async () => {
    const validSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['btn1'] },
        btn1: {
          id: 'btn1',
          type: 'Button',
          props: { children: '可信按钮' },
          childrenIds: [],
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({ schema: validSchema, options: validOptions })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.code).toContain('from "@lowcode-platform/preset-antd/runtime"');
    expect(response.body.data.code).toContain('Button');
    expect(response.body.data.code).toContain('Page');
    expect(pageSchemaServiceMock.getSchema).toHaveBeenCalledWith('page-1', 1);
  });

  it.each([
    ['componentSources', { componentSources: { Title: 'malicious-injected-module' } }],
    ['defaultLibrary', { defaultLibrary: 'malicious-lib' }],
    ['presetId', { presetId: 'unknown-preset' }],
  ])('POST /compiler/export 拒绝废弃或不可信的 options.%s', async (_field, unsafeOption) => {
    const validSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['t1'] },
        t1: {
          id: 't1',
          type: 'Title',
          props: { children: '测试标题' },
          childrenIds: [],
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({ schema: validSchema, options: { ...validOptions, ...unsafeOption } })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('POST /compiler/export 从页面快照解析未知 preset 时 fail-close', async () => {
    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
        },
        options: { pageId: 'unknown-preset-page', pageVersion: 1 },
      })
      .expect(400);

    expect(response.body.message).toMatch(/Unsupported compiler runtimeCompatibility/i);
  });

  it('POST /compiler/export 拒绝历史 draft runtimeCompatibility', async () => {
    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
        },
        options: { pageId: 'legacy-draft-page', pageVersion: 1 },
      })
      .expect(400);

    expect(response.body.message).toMatch(/runtimeCompatibility|preset/i);
  });

  it.each(['preset-version-mismatch-page', 'renderer-version-mismatch-page'])(
    'POST /compiler/export 对 %s 的单字段版本不匹配执行 fail-close',
    async (pageId) => {
      const response = await request(app.getHttpServer())
        .post('/compiler/export')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          schema: {
            schemaVersion: 0,
            rootId: 'root',
            components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
          },
          options: { pageId, pageVersion: 1 },
        })
        .expect(400);

      expect(response.body.message).toMatch(/Unsupported compiler runtimeCompatibility/i);
    },
  );

  it('POST /compiler/export 拒绝可信 Preset 未绑定的组件类型', async () => {
    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          schemaVersion: 0,
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'CustomWidget', childrenIds: [] },
          },
        },
        options: validOptions,
      })
      .expect(400);

    expect(response.body.message).toMatch(/Unsupported component type/i);
  });

  it('POST /compiler/export 拒绝遗留 schema version 字段', async () => {
    const response = await request(app.getHttpServer())
      .post('/compiler/export')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        schema: {
          schemaVersion: 0,
          version: 1,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
        },
        options: validOptions,
      })
      .expect(400);

    expect(response.body.message).toMatch(/version/i);
  });
});
