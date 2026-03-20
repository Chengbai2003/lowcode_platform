import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AgentController } from '../src/modules/agent/agent.controller';
import { AgentService } from '../src/modules/agent/agent.service';
import { PatchApplyService } from '../src/modules/agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../src/modules/agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../src/modules/agent-tools/patch-validation.service';
import { ToolExecutionService } from '../src/modules/agent-tools/tool-execution.service';
import { ToolRegistryService } from '../src/modules/agent-tools/tool-registry.service';
import { ContextAssemblerService } from '../src/modules/schema-context';
import { ComponentMetaRegistry } from '../src/modules/schema-context/component-metadata/component-meta.registry';
import { PageSchemaService } from '../src/modules/page-schema/page-schema.service';

describe('AgentController patch preview (e2e)', () => {
  let app: INestApplication;
  const TEST_SECRET = 'test-secret';

  const pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema'> = {
    getSchema: jest.fn().mockResolvedValue({
      pageId: 'page-1',
      version: 4,
      snapshotId: 'page-1-v4',
      savedAt: '2026-03-20T00:00:00.000Z',
      schema: {
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Page',
            childrenIds: ['form'],
          },
          form: {
            id: 'form',
            type: 'Form',
            childrenIds: ['button'],
          },
          button: {
            id: 'button',
            type: 'Button',
            props: { children: '旧文案' },
          },
        },
      },
    }),
  };

  const contextAssemblerMock: Pick<ContextAssemblerService, 'assemble'> = {
    assemble: jest.fn(),
  };

  beforeEach(async () => {
    process.env.API_SECRET = TEST_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        PatchApplyService,
        PatchAutoFixService,
        ComponentMetaRegistry,
        {
          provide: PageSchemaService,
          useValue: pageSchemaServiceMock,
        },
        {
          provide: ContextAssemblerService,
          useValue: contextAssemblerMock,
        },
        {
          provide: PatchValidationService,
          useFactory: (registry: ComponentMetaRegistry, applyService: PatchApplyService) =>
            new PatchValidationService(registry, applyService),
          inject: [ComponentMetaRegistry, PatchApplyService],
        },
        {
          provide: ToolRegistryService,
          useFactory: (
            pageSchemaService: PageSchemaService,
            contextAssembler: ContextAssemblerService,
            registry: ComponentMetaRegistry,
            applyService: PatchApplyService,
            autoFixService: PatchAutoFixService,
            validationService: PatchValidationService,
          ) =>
            new ToolRegistryService(
              pageSchemaService,
              contextAssembler,
              registry,
              applyService,
              autoFixService,
              validationService,
            ),
          inject: [
            PageSchemaService,
            ContextAssemblerService,
            ComponentMetaRegistry,
            PatchApplyService,
            PatchAutoFixService,
            PatchValidationService,
          ],
        },
        {
          provide: ToolExecutionService,
          useFactory: (
            pageSchemaService: PageSchemaService,
            contextAssembler: ContextAssemblerService,
            toolRegistry: ToolRegistryService,
          ) => new ToolExecutionService(pageSchemaService, contextAssembler, toolRegistry),
          inject: [PageSchemaService, ContextAssemblerService, ToolRegistryService],
        },
        {
          provide: AgentService,
          useValue: { edit: jest.fn() },
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
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) {
      await app.close();
    }
  });

  it('previews updateProps successfully', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['button'] },
            button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
          },
        },
        patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.patch[0].op).toBe('updateProps');
        expect(res.body.schema.components.button.props.children).toBe('提交');
      });
  });

  it('previews bindEvent successfully', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['button'] },
            button: { id: 'button', type: 'Button', props: { children: '提交' } },
          },
        },
        patch: [
          {
            op: 'bindEvent',
            componentId: 'button',
            event: 'onClick',
            actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
          },
        ],
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.schema.components.button.events.onClick).toEqual([
          { type: 'apiCall', url: '/api/save', method: 'POST' },
        ]);
      });
  });

  it('previews insertComponent successfully', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['form'] },
            form: { id: 'form', type: 'Form', childrenIds: [] },
          },
        },
        patch: [
          {
            op: 'insertComponent',
            parentId: 'form',
            component: { id: 'input_email', type: 'Input', props: { placeholder: '邮箱' } },
          },
        ],
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.schema.components.input_email.type).toBe('Input');
        expect(res.body.schema.components.form.childrenIds).toContain('input_email');
      });
  });

  it('returns PAGE_VERSION_CONFLICT when version is stale', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        pageId: 'page-1',
        version: 3,
        patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      })
      .expect(409)
      .expect((res: request.Response) => {
        expect(res.body.code).toBe('PAGE_VERSION_CONFLICT');
        expect(res.body.traceId).toBeTruthy();
      });
  });

  it('returns NODE_NOT_FOUND for missing component targets', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['button'] },
            button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
          },
        },
        patch: [{ op: 'updateProps', componentId: 'missing', props: { children: '提交' } }],
      })
      .expect(404)
      .expect((res: request.Response) => {
        expect(res.body.code).toBe('NODE_NOT_FOUND');
        expect(res.body.traceId).toBeTruthy();
      });
  });

  it('applies autoFix before previewing patch output', () => {
    return request(app.getHttpServer())
      .post('/agent/patch/preview')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        autoFix: true,
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['form'] },
            form: { id: 'form', type: 'Form', childrenIds: [] },
          },
        },
        patch: [
          {
            op: 'insertComponent',
            parentId: 'form',
            component: {
              id: 'input_phone',
              type: 'Input',
              props: { placeholder: '手机号' },
              events: [],
            },
          },
        ],
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.patch[0].component.events).toEqual({});
        expect(res.body.schema.components.input_phone).toBeDefined();
      });
  });
});
