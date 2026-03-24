import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AIService } from '../src/modules/ai/ai.service';
import { ModelConfigService } from '../src/modules/ai/model-config.service';
import { AgentAnswerService } from '../src/modules/agent/agent-answer.service';
import { AgentController } from '../src/modules/agent/agent.controller';
import { AgentIdempotencyService } from '../src/modules/agent/agent-idempotency.service';
import { AgentIntentClassifierService } from '../src/modules/agent/agent-intent-classifier.service';
import { AgentIntentConfirmationService } from '../src/modules/agent/agent-intent-confirmation.service';
import { AgentIntentNormalizationService } from '../src/modules/agent/agent-intent-normalization.service';
import { AgentLegacySchemaService } from '../src/modules/agent/agent-legacy-schema.service';
import { AgentMetricsService } from '../src/modules/agent/agent-metrics.service';
import { AgentPolicyService } from '../src/modules/agent/agent-policy.service';
import { AgentReadCacheService } from '../src/modules/agent/agent-read-cache.service';
import { AgentReplayService } from '../src/modules/agent/agent-replay.service';
import { AgentRoutingService } from '../src/modules/agent/agent-routing.service';
import { AgentRunnerService } from '../src/modules/agent/agent-runner.service';
import { AgentSessionMemoryService } from '../src/modules/agent/agent-session-memory.service';
import { AgentTraceService } from '../src/modules/agent/agent-trace.service';
import { AgentService } from '../src/modules/agent/agent.service';
import { PatchApplyService } from '../src/modules/agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../src/modules/agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../src/modules/agent-tools/patch-validation.service';
import { ToolExecutionService } from '../src/modules/agent-tools/tool-execution.service';
import { ToolRegistryService } from '../src/modules/agent-tools/tool-registry.service';
import { ContextAssemblerService, FocusContextResult } from '../src/modules/schema-context';
import { CollectionTargetResolverService } from '../src/modules/schema-context/collection-target-resolver.service';
import { ComponentMetaRegistry } from '../src/modules/schema-context/component-metadata/component-meta.registry';
import { PageSchemaService } from '../src/modules/page-schema/page-schema.service';
import { AgentScopeConfirmationService } from '../src/modules/agent/agent-scope-confirmation.service';

function createBatchSchema() {
  return {
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
        childrenIds: ['form-item-a', 'form-item-b'],
      },
      'form-item-a': {
        id: 'form-item-a',
        type: 'FormItem',
        props: { label: '用户名', labelWidth: 120 },
        childrenIds: ['input-a'],
      },
      'form-item-b': {
        id: 'form-item-b',
        type: 'FormItem',
        props: { label: '密码', labelWidth: 120 },
        childrenIds: ['input-b'],
      },
      'input-a': {
        id: 'input-a',
        type: 'Input',
        props: { placeholder: '请输入用户名' },
      },
      'input-b': {
        id: 'input-b',
        type: 'Input',
        props: { placeholder: '请输入密码' },
      },
    },
  };
}

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

  const aiServiceMock: Pick<AIService, 'chat' | 'runToolCalling' | 'streamChatText'> = {
    chat: jest.fn(),
    runToolCalling: jest.fn(),
    streamChatText: jest.fn(),
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
    (aiServiceMock.streamChatText as jest.Mock).mockImplementation(
      async (
        dto: { messages?: Array<{ content: string }> },
        options?: { onTextDelta?: (delta: string) => Promise<void> | void },
      ) => {
        const content =
          dto.messages?.[0]?.content?.includes('通用助手') ||
          dto.messages?.[0]?.content?.includes('页面理解助手')
            ? '这是一个流式回答。'
            : '{"rootId":"root","components":{"root":{"id":"root","type":"Page"}}}';
        await options?.onTextDelta?.(content);
        return {
          content,
          usage: {
            promptTokens: 5,
            completionTokens: 6,
            totalTokens: 11,
          },
          finishReason: 'stop',
        };
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        PatchApplyService,
        PatchAutoFixService,
        ComponentMetaRegistry,
        CollectionTargetResolverService,
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
            collectionTargetResolver: CollectionTargetResolverService,
            autoFixService: PatchAutoFixService,
            validationService: PatchValidationService,
          ) =>
            new ToolRegistryService(
              contextAssembler,
              registry,
              collectionTargetResolver,
              autoFixService,
              validationService,
            ),
          inject: [
            ContextAssemblerService,
            ComponentMetaRegistry,
            CollectionTargetResolverService,
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
        AgentAnswerService,
        AgentIdempotencyService,
        AgentIntentClassifierService,
        AgentIntentConfirmationService,
        AgentIntentNormalizationService,
        AgentPolicyService,
        AgentReadCacheService,
        AgentReplayService,
        AgentRoutingService,
        AgentScopeConfirmationService,
        AgentTraceService,
        AgentMetricsService,
        AgentRunnerService,
        AgentSessionMemoryService,
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

  it('exposes structured trace and replay data by traceId', async () => {
    const editResponse = await request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '生成一个详情页',
        pageId: 'page-1',
        version: 4,
        responseMode: 'auto',
      })
      .expect(200);

    const traceId = editResponse.body.traceId as string;

    await request(app.getHttpServer())
      .get(`/agent/traces/${traceId}`)
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.traceId).toBe(traceId);
        expect(res.body.request.instruction).toBe('生成一个详情页');
        expect(res.body.route.resolvedMode).toBe('schema');
        expect(Array.isArray(res.body.statusEvents)).toBe(true);
      });

    await request(app.getHttpServer())
      .get(`/agent/traces/${traceId}/replay`)
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.traceId).toBe(traceId);
        expect(Array.isArray(res.body.replaySteps)).toBe(true);
        expect(res.body.replaySteps.length).toBeGreaterThan(0);
      });
  });

  it('returns aggregated metrics summary', async () => {
    await request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '生成一个登录页',
        pageId: 'page-1',
        version: 4,
        responseMode: 'auto',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/agent/metrics/summary')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.totalCount).toBeGreaterThan(0);
        expect(typeof res.body.averageDurationMs).toBe('number');
        expect(typeof res.body.averageToolCallCount).toBe('number');
        expect(typeof res.body.versionConflictCount).toBe('number');
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

  it('routes page understanding questions to answer mode', () => {
    (aiServiceMock.chat as jest.Mock).mockResolvedValue({
      content: '这是一个包含表单和提交按钮的页面。',
      usage: {
        promptTokens: 5,
        completionTokens: 6,
        totalTokens: 11,
      },
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '这个页面是做什么的？',
        pageId: 'page-1',
        version: 4,
        responseMode: 'auto',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('answer');
        expect(res.body.content).toContain('页面');
        expect(res.body.route).toMatchObject({
          requestedMode: 'auto',
          resolvedMode: 'answer',
          reason: 'page_question_intent',
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
        expect(res.body.previewSchema.components.button.props.children).toBe('提交');
        expect(res.body.previewSummary).toContain('patch');
        expect(res.body.changeGroups).toHaveLength(1);
        expect(res.body.risk.level).toBe('low');
        expect(res.body.requiresConfirmation).toBe(false);
      });
  });

  it('returns clarification for collection edits without a selected container', () => {
    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '修改全部表单 label',
        pageId: 'page-1',
        version: 4,
        responseMode: 'patch',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('clarification');
        expect(res.body.question).toContain('父级或祖先容器');
        expect(res.body.candidates).toEqual([]);
      });
  });

  it('returns scope confirmation before generating batch patch previews', () => {
    (aiServiceMock.runToolCalling as jest.Mock).mockImplementation(async (input: any) => {
      await input.executeTool('resolve_collection_scope', {
        rootId: 'form',
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
      });
      return {
        text: 'scope planned',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        totalUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        warnings: [],
        steps: [
          {
            stepNumber: 0,
            finishReason: 'stop',
            toolCalls: [{ toolName: 'resolve_collection_scope' }],
          },
        ],
        toolCallCount: 1,
      };
    });

    return request(app.getHttpServer())
      .post('/agent/edit')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '将当前表单下所有表单项 label 宽度设置为 200',
        pageId: 'page-1',
        version: 4,
        selectedId: 'form',
        sessionId: 'session-batch-e2e',
        draftSchema: createBatchSchema(),
        responseMode: 'patch',
      })
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('scope_confirmation');
        expect(res.body.scope).toEqual({
          rootId: 'form',
          matchedType: 'FormItem',
          matchedDisplayName: '表单项',
          targetIds: ['form-item-a', 'form-item-b'],
          targetCount: 2,
        });
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
        expect(res.body.previewSchema.components.button.props.children).toBe('提交');
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
        expect(res.body.changeGroups[0].kind).toBe('event');
      });
  });

  it('auto-recovers stale patch requests against the latest page version', () => {
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
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('patch');
        expect(res.body.retryCount).toBe(1);
        expect(res.body.resolvedVersion).toBe(4);
      });
  });

  it('returns clarification response when candidates are too close', () => {
    (contextAssemblerMock.assemble as jest.Mock).mockResolvedValueOnce({
      mode: 'candidates',
      schema: {
        version: 4,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['card-primary', 'card-secondary'] },
          'card-primary': {
            id: 'card-primary',
            type: 'Card',
            props: { title: '主操作区' },
            childrenIds: ['button-a'],
          },
          'card-secondary': {
            id: 'card-secondary',
            type: 'Card',
            props: { title: '次操作区' },
            childrenIds: ['button-b'],
          },
          'button-a': { id: 'button-a', type: 'Button', props: { children: '提交' } },
          'button-b': { id: 'button-b', type: 'Button', props: { children: '保存' } },
        },
      },
      componentList: ['Page', 'Card', 'Button'],
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
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.mode).toBe('clarification');
        expect(res.body.candidates).toHaveLength(2);
        expect(res.body.candidates[0]).toMatchObject({
          id: 'button-a',
          displayLabel: '提交',
          secondaryLabel: '按钮',
          pathLabel: '页面 > 主操作区',
        });
        expect(res.body.question).toContain('目标组件');
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
    expect(events.map((event) => event.event)).not.toContain('content_delta');
    expect(
      events.find(
        (event) =>
          event.event === 'status' &&
          event.data.stage === 'calling_model' &&
          String(event.data.label).includes('正在准备生成'),
      ),
    ).toBeTruthy();
    expect(
      events.find((event) => event.event === 'status' && event.data.stage === 'validating_output'),
    ).toBeTruthy();
    expect(events.map((event) => event.event)).toContain('result');
    expect(events.at(-1)?.event).toBe('done');
    expect(events.find((event) => event.event === 'route')?.data.route.resolvedMode).toBe('schema');
  });

  it('streams answer mode content events', async () => {
    const response = await request(app.getHttpServer())
      .post('/agent/edit/stream')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send({
        instruction: '这个页面是做什么的？',
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
    expect(events.map((event) => event.event)).toContain('content_delta');
    expect(events.find((event) => event.event === 'result')?.data.result.content).toContain(
      '流式回答',
    );
    expect(events.find((event) => event.event === 'route')?.data.route.resolvedMode).toBe('answer');
  });

  it('streams retry status and final result for stale patch requests', async () => {
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
    const retryEvent = events.find(
      (event) => event.event === 'status' && event.data.stage === 'retrying',
    );
    const resultEvent = events.find((event) => event.event === 'result');
    expect(retryEvent?.data.label).toContain('版本冲突');
    expect(resultEvent?.data.result.mode).toBe('patch');
    expect(resultEvent?.data.result.retryCount).toBe(1);
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
