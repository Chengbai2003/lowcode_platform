import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentToolsModule } from '../agent-tools.module';
import { PatchValidationService } from '../patch-validation.service';
import { PageSchemaRepository } from '../../page-schema/repositories/page-schema.repository';

/**
 * P1: PatchValidationService 注入 DeploymentRuntimeProfileRegistry 后，
 * 真实 AgentToolsModule 必须能在 Nest DI 中解析（@Optional + 内置默认 Registry），
 * 而不是因未注册该 token 直接启动失败。
 */
describe('AgentToolsModule real Nest bootstrap', () => {
  const originalSecret = process.env.API_SECRET;

  beforeAll(() => {
    process.env.API_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.API_SECRET;
    } else {
      process.env.API_SECRET = originalSecret;
    }
  });

  it('resolves PatchValidationService without a registered DeploymentRuntimeProfileRegistry provider', async () => {
    const repositoryMock = {
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      getPage: jest.fn(),
      getLatestSnapshot: jest.fn(),
      getSnapshotByVersion: jest.fn(),
      saveSchema: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AgentToolsModule],
    })
      .overrideProvider(PageSchemaRepository)
      .useValue(repositoryMock)
      .compile();

    await moduleRef.init();

    const service = moduleRef.get(PatchValidationService);
    expect(service).toBeInstanceOf(PatchValidationService);

    await moduleRef.close();
  });
});
