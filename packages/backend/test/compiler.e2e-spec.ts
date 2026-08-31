import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CompilerController } from '../src/modules/compiler/compiler.controller';
import { CompilerService } from '../src/modules/compiler/compiler.service';

describe('Compiler (e2e security & contract boundaries)', () => {
  let app: INestApplication;
  const TEST_SECRET = 'test-secret';

  beforeEach(async () => {
    process.env.API_SECRET = TEST_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CompilerController],
      providers: [
        CompilerService,
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
      .send({ schema: validSchema })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.code).toContain('from "@lowcode-platform/preset-antd/runtime"');
    expect(response.body.data.code).toContain('Button');
    expect(response.body.data.code).toContain('Page');
  });

  it('POST /compiler/export 忽略客户端注入的非法 componentSources，强制使用服务端可信绑定', async () => {
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
      .send({
        schema: validSchema,
        options: {
          componentSources: {
            Title: 'malicious-injected-module',
          },
          defaultLibrary: 'malicious-lib',
        },
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    // 客户端注入的 malicious 模块不得出现在生成代码中
    expect(response.body.data.code).not.toContain('malicious-injected-module');
    expect(response.body.data.code).not.toContain('malicious-lib');
    expect(response.body.data.code).toContain('@lowcode-platform/preset-antd/runtime');
  });
});
