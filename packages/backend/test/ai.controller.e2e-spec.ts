import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AIController } from '../src/modules/ai/ai.controller';
import { ModelConfigService } from '../src/modules/ai/model-config.service';
import { AIService } from '../src/modules/ai/ai.service';
import { ConfigService } from '@nestjs/config';

/**
 * AIController E2E：使用真实 AuthGuard 验证鉴权与 DTO 校验。
 * - ConfigService mock 真实响应 API_SECRET，不依赖开发机环境变量
 * - App 全生命周期只创建（beforeAll）与关闭（afterAll）一次，beforeEach 仅清理 Mock，
 *   避免每个用例泄漏一个未关闭的 Nest 实例
 */
describe('AIController (e2e) - Security & Routes Validation', () => {
  let app: INestApplication;
  const TEST_SECRET = 'test-secret';

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'API_SECRET') return TEST_SECRET;
      return undefined;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AIController],
      providers: [
        {
          provide: ModelConfigService,
          useValue: {
            saveModel: jest.fn().mockReturnValue({ success: true }),
            deleteModel: jest.fn().mockReturnValue({ success: true }),
          },
        },
        {
          provide: AIService,
          useValue: {}, // Mock AiService dependencies
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the exact ValidationPipe used in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    // 仅清理调用记录；实现（如 ConfigService.get 的响应）保持不变
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/ai/models', () => {
    it('should pass with valid full payload when token is provided', () => {
      return request(app.getHttpServer())
        .post('/ai/models')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: 'test-model',
          name: 'Test Model',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
        })
        .expect(201)
        .expect({ success: true });
    });

    it('should fail when missing required fields (id, name, provider, model)', () => {
      return request(app.getHttpServer())
        .post('/ai/models')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          provider: 'openai',
          temperature: 0.7,
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              'id should not be empty',
              'name should not be empty',
              'model should not be empty',
            ]),
          );
        });
    });

    it('should fail when temperature is out of range', () => {
      return request(app.getHttpServer())
        .post('/ai/models')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: 'test',
          name: 'test',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 5, // Range is 0-2
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain('temperature must not be greater than 2');
        });
    });

    it('should reject non-whitelisted properties', () => {
      return request(app.getHttpServer())
        .post('/ai/models')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: 'test',
          name: 'test',
          provider: 'openai',
          model: 'gpt-4',
          hacked_admin_field: true, // Non-whitelisted field
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain('property hacked_admin_field should not exist');
        });
    });
  });

  describe('DELETE /api/ai/models/:id', () => {
    it('should fail when no authorization header is provided (Security 401)', () => {
      return (
        request(app.getHttpServer())
          .delete('/ai/models/model-1')
          // NO Authorization header
          .expect(401)
      );
    });

    it('should fail when wrong token is provided (Security 401)', () => {
      return request(app.getHttpServer())
        .delete('/ai/models/model-1')
        .set('Authorization', 'Bearer WRONG_TOKEN')
        .expect(401);
    });

    it('should delete the model properly when token is provided (Restful)', () => {
      return request(app.getHttpServer())
        .delete('/ai/models/model-1')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .expect(200); // `@Delete` returns 200 by default in NestJS
    });
  });
});
