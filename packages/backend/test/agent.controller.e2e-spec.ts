import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AIService } from '../src/modules/ai/ai.service';
import { ModelConfigService } from '../src/modules/ai/model-config.service';
import { AgentController } from '../src/modules/agent/agent.controller';
import { AgentLegacySchemaService } from '../src/modules/agent/agent-legacy-schema.service';
import { AgentPolicyService } from '../src/modules/agent/agent-policy.service';
import { AgentRoutingService } from '../src/modules/agent/agent-routing.service';
import { AgentRunnerService } from '../src/modules/agent/agent-runner.service';
import { AgentService } from '../src/modules/agent/agent.service';
import { PatchApplyService } from '../src/modules/agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../src/modules/agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../src/modules/agent-tools/patch-validation.service';
import { ToolExecutionService } from '../src/modules/agent-tools/tool-execution.service';
import { ToolRegistryService } from '../src/modules/agent-tools/tool-registry.service';
import { ContextAssemblerService, FocusContextResult } from '../src/modules/schema-context';
import { ComponentMetaRegistry } from '../src/modules/schema-context/component-metadata/component-meta.registry';
import { PageSchemaService } from '../src/modules/page-schema/page-schema.service';

describe('AgentController (e2e)', () => {
  let app: INestApplication;
  const TEST_SECRET = 'test-secret';

  const pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema'> = {
    getSchema: jest.fn().mockResolvedValue({
      pageId: 'page-1',
      version: 4,
      snapshotId: 'page-1-v4',
      savedAt: '2026-03-20T00:00:00.000Z',
      schema: {
        version: 4,
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

  const aiServiceMock: Pick<AIService, 'chat' | 'runToolCalling'> = {
    chat: jest.fn(),
    runToolCalling: jest.fn(),
  };

  const contextAssemblerMock: jest.Mocked<Pick<ContextAssemblerService, 'assemble'>> = {
    assemble: jest.fn(async (input: any): Promise<FocusContextResult> => {
      const baseSchema =
        input.draftSchema ??
        ({
          version: 4,
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: ['form'] },
            form: { id: 'form', type: 'Form', childrenIds: ['button'] },
            button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
          },
        } as any);

      if (input.selectedId === 'button') {
        return {
          mode: 'focused',
          schema: baseSchema,
          componentList: ['Page', 'Form', 'Button', 'Input'],
          context: {
            focusNode: {
              id: 'button',
              type: 'Button',
              props: { children: '旧文案' },
            },
            parent: {
              id: 'form',
              type: 'Form',
              childrenIds: ['button'],
            },
            ancestors: [{ id: 'root', type: 'Page', depth: 0 }],
            children: [],
            siblings: [],
            subtree: {
              button: {
                id: 'button',
                type: 'Button',
                props: { children: '旧文案' },
              },
            },
            schemaStats: {
              totalComponents: 3,
              maxDepth: 2,
              rootId: 'root',
              version: 4,
            },
            estimatedTokens: 16,
          },
        } as FocusContextResult;
      }

      if (input.selectedId === 'form') {
        return {
          mode: 'focused',
          schema: baseSchema,
          componentList: ['Page', 'Form', 'Button', 'Input'],
          context: {
            focusNode: {
              id: 'form',
              type: 'Form',
              childrenIds: ['button'],
            },
            parent: {
              id: 'root',
              type: 'Page',
              childrenIds: ['form'],
            },
            ancestors: [],
            children: [{ id: 'button', type: 'Button', props: { children: '旧文案' } }],
            siblings: [],
            subtree: {
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
            schemaStats: {
              totalComponents: 3,
              maxDepth: 2,
              rootId: 'root',
              version: 4,
            },
            estimatedTokens: 20,
          },
        } as FocusContextResult;
      }

      return {
        mode: 'candidates',
        schema: baseSchema,
        componentList: ['Page', 'Form', 'Button', 'Input'],
        candidates: [
          { id: 'button', type: 'Button', score: 0.8, reason: '文本匹配', matchType: 'prop_value' },
        ],
      } as FocusContextResult;
    }),
  };

  const parseSseEvents = (raw: string) =>
    raw
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const eventLine = chunk.split(/\r?\n/).find((line) => line.startsWith('event:'));
        const dataLines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trim());
        return {
          event: eventLine?.slice('event:'.length).trim(),
          data: dataLines.length > 0 ? JSON.parse(dataLines.join('\n')) : undefined,
        };
      });

  beforeEach(async () => {
    process.env.API_SECRET = TEST_SECRET;
    jest.clearAllMocks();

    (aiServiceMock.chat as jest.Mock).mockResolvedValue({
      content: '{"rootId":"root","components":{"root":{"id":"root","type":"Page"}}}',
      usage: {
        promptTokens: 5,
        completionTokens: 6,
        totalTokens: 11,
      },
    });

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
            contextAssembler: ContextAssemblerService,
            registry: ComponentMetaRegistry,
            autoFixService: PatchAutoFixService,
            validationService: PatchValidationService,
          ) =>
            new ToolRegistryService(contextAssembler, registry, autoFixService, validationService),
          inject: [
            ContextAssemblerService,
            ComponentMetaRegistry,
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
          provide: AIService,
          useValue: aiServiceMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'API_SECRET') {
                return TEST_SECRET;
              }
              if (key === 'ai.defaultProvider') {
                return 'openai';
              }
              return fallback;
            }),
          },
        },
        {
          provide: ModelConfigService,
          useValue: {
            getModel: jest.fn(),
          },
        },
        AgentLegacySchemaService,
        AgentPolicyService,
        AgentRoutingService,
        AgentRunnerService,
        AgentService,
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
    if (app) {
      await app.close();
    }
  });

  it('defaults /agent/edit to schema mode', () => {
    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '生成一个页面',
        pageId: 'page-1',
        version: 4,
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('schema');
        expect(res.body.traceId).toMatch(/^agent-/);
        expect(res.body.route.resolvedMode).toBe('schema');
      });
  });

  it('routes auto mode to schema for whole-page generation intent', () => {
    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '生成一个登录页',
        pageId: 'page-1',
        version: 4,
        responseMode: 'auto',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('schema');
        expect(res.body.route).toMatchObject({
          requestedMode: 'auto',
          resolvedMode: 'schema',
          reason: 'whole_page_generation_intent',
        });
      });
  });

  it('returns patch response for updateProps in patch mode', () => {
    (aiServiceMock.runToolCalling as jest.Mock).mockImplementation(async (input: any) => {
      await input.executeTool('update_component_props', {
        componentId: 'button',
        props: { children: '提交' },
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 4,
        selectedId: 'button',
        responseMode: 'patch',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('patch');
        expect(res.body.resolvedSelectedId).toBe('button');
        expect(res.body.route.resolvedMode).toBe('patch');
        expect(res.body.patch).toEqual([
          {
            op: 'updateProps',
            componentId: 'button',
            props: { children: '提交' },
          },
        ]);
      });
  });

  it('routes auto mode to patch for focused edit intent', () => {
    (aiServiceMock.runToolCalling as jest.Mock).mockImplementation(async (input: any) => {
      await input.executeTool('update_component_props', {
        componentId: 'button',
        props: { children: '提交' },
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 4,
        selectedId: 'button',
        responseMode: 'auto',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('patch');
        expect(res.body.route).toMatchObject({
          requestedMode: 'auto',
          resolvedMode: 'patch',
          reason: 'selected_target',
        });
      });
  });

  it('returns patch response for bindEvent in patch mode', () => {
    (aiServiceMock.runToolCalling as jest.Mock).mockImplementation(async (input: any) => {
      await input.executeTool('bind_event', {
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [{ stepNumber: 0, finishReason: 'stop', toolCalls: [{ toolName: 'bind_event' }] }],
        toolCallCount: 1,
      };
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '给按钮绑定保存事件',
        pageId: 'page-1',
        version: 4,
        selectedId: 'button',
        responseMode: 'patch',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('patch');
        expect(res.body.patch[0]).toEqual({
          op: 'bindEvent',
          componentId: 'button',
          event: 'onClick',
          actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
        });
      });
  });

  it('returns PAGE_VERSION_CONFLICT when patch mode version is stale', () => {
    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'patch',
      })
      .expect(409)
      .expect((res: request.Response) => {
        expect(res.body.code).toBe('PAGE_VERSION_CONFLICT');
      });
  });

  it('returns NODE_AMBIGUOUS when candidates are too close', () => {
    (contextAssemblerMock.assemble as jest.Mock).mockResolvedValueOnce({
      mode: 'candidates',
      schema: {
        version: 4,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['form'] },
          form: { id: 'form', type: 'Form', childrenIds: ['button'] },
          button: { id: 'button', type: 'Button', props: { children: '旧文案' } },
        },
      },
      componentList: ['Page', 'Form', 'Button'],
      candidates: [
        {
          id: 'button-a',
          type: 'Button',
          score: 0.46,
          reason: '文本匹配',
          matchType: 'prop_value',
        },
        { id: 'button-b', type: 'Button', score: 0.4, reason: '文本匹配', matchType: 'prop_value' },
      ],
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把那个按钮改成提交',
        pageId: 'page-1',
        version: 4,
        responseMode: 'patch',
      })
      .expect(422)
      .expect((res: request.Response) => {
        expect(res.body.code).toBe('NODE_AMBIGUOUS');
        expect(res.body.details.candidates).toHaveLength(2);
      });
  });

  it('returns AGENT_POLICY_BLOCKED when provider is not enabled for patch mode', () => {
    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 4,
        provider: 'ollama',
        responseMode: 'patch',
      })
      .expect(422)
      .expect((res: request.Response) => {
        expect(res.body.code).toBe('AGENT_POLICY_BLOCKED');
      });
  });

  it('streams patch mode progress events', async () => {
    (aiServiceMock.runToolCalling as jest.Mock).mockImplementation(async (input: any) => {
      await input.executeTool('update_component_props', {
        componentId: 'button',
        props: { children: '提交' },
      });
      return {
        text: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'update_component_props' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    const response = await request(app.getHttpServer())
      .post('/agent/edit/stream')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 4,
        selectedId: 'button',
        responseMode: 'auto',
      })
      .buffer(true)
      .parse((res, callback) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => callback(null, body));
      });

    const events = parseSseEvents(response.body as string);
    expect(events.map((event) => event.event)).toContain('meta');
    expect(events.map((event) => event.event)).toContain('route');
    expect(events.map((event) => event.event)).toContain('status');
    expect(events.map((event) => event.event)).toContain('result');
    expect(events.at(-1)?.event).toBe('done');
    expect(events.find((event) => event.event === 'route')?.data.route.resolvedMode).toBe('patch');
  });

  it('streams schema mode progress events', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent/edit/stream')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '生成一个登录页',
        pageId: 'page-1',
        version: 4,
        responseMode: 'auto',
      })
      .buffer(true)
      .parse((res, callback) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => callback(null, body));
      });

    const events = parseSseEvents(response.body as string);
    expect(events.map((event) => event.event)).toContain('meta');
    expect(events.map((event) => event.event)).toContain('route');
    expect(events.map((event) => event.event)).toContain('result');
    expect(events.at(-1)?.event).toBe('done');
    expect(events.find((event) => event.event === 'route')?.data.route.resolvedMode).toBe('schema');
  });

  it('streams structured errors for stale patch requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent/edit/stream')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'patch',
      })
      .buffer(true)
      .parse((res, callback) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => callback(null, body));
      });

    const events = parseSseEvents(response.body as string);
    const errorEvent = events.find((event) => event.event === 'error');
    expect(errorEvent?.data.error.code).toBe('PAGE_VERSION_CONFLICT');
    expect(errorEvent?.data.error.traceId).toBeTruthy();
    expect(events.at(-1)?.event).toBe('done');
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

  it('returns PAGE_VERSION_CONFLICT when patch preview version is stale', () => {
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
