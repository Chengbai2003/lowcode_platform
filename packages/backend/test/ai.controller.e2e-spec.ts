import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AIController } from "../src/modules/ai/ai.controller";
import { ModelConfigService } from "../src/modules/ai/model-config.service";
import { AIService } from "../src/modules/ai/ai.service";
import { ConfigService } from "@nestjs/config";

describe("AIController (e2e) - Security & Routes Validation", () => {
  let app: INestApplication;
  let modelConfigService: ModelConfigService;
  const TEST_SECRET = 'test-secret';

  beforeEach(async () => {
    // 注入模拟的环境变量用于鉴权拦截器
    process.env.API_SECRET = TEST_SECRET;

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
          useValue: { get: jest.fn() },
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

    modelConfigService =
      moduleFixture.get<ModelConfigService>(ModelConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/ai/models", () => {
    it("should pass with valid full payload when token is provided", () => {
      return request(app.getHttpServer())
        .post("/ai/models")
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: "test-model",
          name: "Test Model",
          provider: "openai",
          model: "gpt-4",
          temperature: 0.7,
        })
        .expect(201)
        .expect({ success: true });
    });

    it("should fail when missing required fields (id, name, provider, model)", () => {
      return request(app.getHttpServer())
        .post("/ai/models")
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          provider: "openai",
          temperature: 0.7,
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              "id should not be empty",
              "name should not be empty",
              "model should not be empty",
            ]),
          );
        });
    });

    it("should fail when temperature is out of range", () => {
      return request(app.getHttpServer())
        .post("/ai/models")
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: "test",
          name: "test",
          provider: "openai",
          model: "gpt-4",
          temperature: 5, // Range is 0-2
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain(
            "temperature must not be greater than 2",
          );
        });
    });

    it("should reject non-whitelisted properties", () => {
      return request(app.getHttpServer())
        .post("/ai/models")
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({
          id: "test",
          name: "test",
          provider: "openai",
          model: "gpt-4",
          hacked_admin_field: true, // Non-whitelisted field
        })
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain(
            "property hacked_admin_field should not exist",
          );
        });
    });
  });

  describe("DELETE /api/ai/models/:id", () => {
    it("should fail when no authorization header is provided (Security 401)", () => {
      return request(app.getHttpServer())
        .delete("/ai/models/model-1")
        // NO Authorization header
        .expect(401);
    });

    it("should fail when wrong token is provided (Security 401)", () => {
      return request(app.getHttpServer())
        .delete("/ai/models/model-1")
        .set('Authorization', 'Bearer WRONG_TOKEN')
        .expect(401);
    });

    it("should delete the model properly when token is provided (Restful)", () => {
      return request(app.getHttpServer())
        .delete("/ai/models/model-1")
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .expect(200); // `@Delete` returns 200 by default in NestJS
    });
  });
});
