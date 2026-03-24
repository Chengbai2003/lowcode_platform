import { AgentAnswerService } from './agent-answer.service';
import { AgentIdempotencyService } from './agent-idempotency.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentReadCacheService } from './agent-read-cache.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentSessionMemoryService } from './agent-session-memory.service';
import { AgentService } from './agent.service';
import { AgentTraceService } from './agent-trace.service';

describe('AgentService', () => {
  it('routes answer mode requests to the answer service', async () => {
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn().mockResolvedValue({
        mode: 'answer',
        content: '这是一个登录页。',
        warnings: [],
        traceId: 'agent-answer',
        route: {
          requestedMode: 'answer',
          resolvedMode: 'answer',
          reason: 'manual_answer',
          manualOverride: true,
        },
      }),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn(),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'createTraceId' | 'resolve'>> = {
      createTraceId: jest.fn().mockReturnValue('agent-answer'),
      resolve: jest.fn().mockResolvedValue({
        traceId: 'agent-answer',
        route: {
          requestedMode: 'answer',
          resolvedMode: 'answer',
          reason: 'manual_answer',
          manualOverride: true,
        },
      }),
    };
    const sessionMemoryService: jest.Mocked<
      Pick<AgentSessionMemoryService, 'prepare' | 'remember'>
    > = {
      prepare: jest.fn().mockReturnValue({ recentHistory: [] }),
      remember: jest.fn(),
    };
    const readCacheService: jest.Mocked<Pick<AgentReadCacheService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const idempotencyService: jest.Mocked<Pick<AgentIdempotencyService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const traceService = new AgentTraceService();

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService as unknown as AgentSessionMemoryService,
      readCacheService as unknown as AgentReadCacheService,
      idempotencyService as unknown as AgentIdempotencyService,
      traceService,
    );

    const result = await service.edit(
      {
        instruction: '这个页面是做什么的？',
        responseMode: 'answer',
      },
      'request-answer',
    );

    expect(answerService.answer).toHaveBeenCalled();
    expect(legacySchemaService.edit).not.toHaveBeenCalled();
    expect(runnerService.runEdit).not.toHaveBeenCalled();
    expect(result.mode).toBe('answer');
  });

  it('routes schema mode requests to the legacy schema service', async () => {
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn(),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn().mockResolvedValue({
        mode: 'schema',
        content: '{}',
        warnings: [],
        traceId: 'agent-trace',
        route: {
          requestedMode: 'schema',
          resolvedMode: 'schema',
          reason: 'manual_schema',
          manualOverride: true,
        },
      }),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn(),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'createTraceId' | 'resolve'>> = {
      createTraceId: jest.fn().mockReturnValue('agent-request-1'),
      resolve: jest.fn().mockResolvedValue({
        traceId: 'agent-request-1',
        route: {
          requestedMode: 'schema',
          resolvedMode: 'schema',
          reason: 'manual_schema',
          manualOverride: true,
        },
      }),
    };
    const sessionMemoryService: jest.Mocked<
      Pick<AgentSessionMemoryService, 'prepare' | 'remember'>
    > = {
      prepare: jest.fn().mockReturnValue({ recentHistory: [] }),
      remember: jest.fn(),
    };
    const readCacheService: jest.Mocked<Pick<AgentReadCacheService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const idempotencyService: jest.Mocked<Pick<AgentIdempotencyService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const traceService = new AgentTraceService();

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService as unknown as AgentSessionMemoryService,
      readCacheService as unknown as AgentReadCacheService,
      idempotencyService as unknown as AgentIdempotencyService,
      traceService,
    );

    const result = await service.edit(
      {
        instruction: '更新页面标题',
      },
      'request-1',
    );

    expect(legacySchemaService.edit).toHaveBeenCalledWith(
      {
        instruction: '更新页面标题',
        conversationHistory: [],
      },
      'agent-request-1',
      expect.objectContaining({
        conversationContext: {
          recentHistory: [],
        },
        routeDecision: expect.objectContaining({
          route: expect.objectContaining({
            resolvedMode: 'schema',
          }),
        }),
      }),
    );
    expect(answerService.answer).not.toHaveBeenCalled();
    expect(runnerService.runEdit).not.toHaveBeenCalled();
    expect(result.mode).toBe('schema');
  });

  it('routes patch mode requests to the bounded agent runner', async () => {
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn(),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn().mockResolvedValue({
        mode: 'patch',
        patch: [],
        previewSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page' },
          },
        },
        previewSummary: '本次修改共 0 个 patch。',
        changeGroups: [],
        risk: {
          level: 'low',
          reasons: ['局部低范围修改'],
          patchOps: 0,
          distinctTargets: 0,
          requiresConfirmation: false,
        },
        requiresConfirmation: false,
        warnings: [],
        traceId: 'agent-trace',
        route: {
          requestedMode: 'patch',
          resolvedMode: 'patch',
          reason: 'manual_patch',
          manualOverride: true,
        },
      }),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'createTraceId' | 'resolve'>> = {
      createTraceId: jest.fn().mockReturnValue('agent-request-2'),
      resolve: jest.fn().mockResolvedValue({
        traceId: 'agent-request-2',
        route: {
          requestedMode: 'patch',
          resolvedMode: 'patch',
          reason: 'manual_patch',
          manualOverride: true,
        },
      }),
    };
    const sessionMemoryService: jest.Mocked<
      Pick<AgentSessionMemoryService, 'prepare' | 'remember'>
    > = {
      prepare: jest.fn().mockReturnValue({ recentHistory: [] }),
      remember: jest.fn(),
    };
    const readCacheService: jest.Mocked<Pick<AgentReadCacheService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const idempotencyService: jest.Mocked<Pick<AgentIdempotencyService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const traceService = new AgentTraceService();

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService as unknown as AgentSessionMemoryService,
      readCacheService as unknown as AgentReadCacheService,
      idempotencyService as unknown as AgentIdempotencyService,
      traceService,
    );

    const result = await service.edit(
      {
        instruction: '把按钮改成提交',
        responseMode: 'patch',
      },
      'request-2',
    );

    expect(runnerService.runEdit).toHaveBeenCalledWith(
      {
        instruction: '把按钮改成提交',
        responseMode: 'patch',
        conversationHistory: [],
      },
      'agent-request-2',
      expect.objectContaining({
        conversationContext: {
          recentHistory: [],
        },
        routeDecision: expect.objectContaining({
          route: expect.objectContaining({
            resolvedMode: 'patch',
          }),
        }),
      }),
    );
    expect(answerService.answer).not.toHaveBeenCalled();
    expect(legacySchemaService.edit).not.toHaveBeenCalled();
    expect(result.mode).toBe('patch');
  });

  it('reuses cached answer responses before calling downstream services', async () => {
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn(),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn(),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'createTraceId' | 'resolve'>> = {
      createTraceId: jest.fn().mockReturnValue('agent-cache'),
      resolve: jest.fn().mockResolvedValue({
        traceId: 'agent-cache',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'answer',
          reason: 'page_question_intent',
          manualOverride: false,
        },
      }),
    };
    const sessionMemoryService: jest.Mocked<
      Pick<AgentSessionMemoryService, 'prepare' | 'remember'>
    > = {
      prepare: jest.fn().mockReturnValue({ recentHistory: [] }),
      remember: jest.fn(),
    };
    const readCacheService: jest.Mocked<Pick<AgentReadCacheService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue({
        mode: 'answer',
        content: '缓存命中',
        warnings: [],
        traceId: 'stale-trace',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'answer',
          reason: 'page_question_intent',
          manualOverride: false,
        },
        cacheHit: false,
      }),
      set: jest.fn(),
    };
    const idempotencyService: jest.Mocked<Pick<AgentIdempotencyService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const traceService = new AgentTraceService();

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService as unknown as AgentSessionMemoryService,
      readCacheService as unknown as AgentReadCacheService,
      idempotencyService as unknown as AgentIdempotencyService,
      traceService,
    );

    const result = await service.edit(
      {
        instruction: '这个页面是做什么的？',
        responseMode: 'auto',
      },
      'request-cache',
    );

    expect(answerService.answer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: 'answer',
      content: '缓存命中',
      traceId: 'agent-cache',
      cacheHit: true,
    });
  });

  it('reuses idempotent patch preview responses before rerunning the agent', async () => {
    const answerService: jest.Mocked<Pick<AgentAnswerService, 'answer'>> = {
      answer: jest.fn(),
    };
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn(),
    };
    const routingService: jest.Mocked<Pick<AgentRoutingService, 'createTraceId' | 'resolve'>> = {
      createTraceId: jest.fn().mockReturnValue('agent-idempotent'),
      resolve: jest.fn().mockResolvedValue({
        traceId: 'agent-idempotent',
        route: {
          requestedMode: 'patch',
          resolvedMode: 'patch',
          reason: 'manual_patch',
          manualOverride: true,
        },
      }),
    };
    const sessionMemoryService: jest.Mocked<
      Pick<AgentSessionMemoryService, 'prepare' | 'remember'>
    > = {
      prepare: jest.fn().mockReturnValue({ recentHistory: [] }),
      remember: jest.fn(),
    };
    const readCacheService: jest.Mocked<Pick<AgentReadCacheService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
    };
    const idempotencyService: jest.Mocked<Pick<AgentIdempotencyService, 'get' | 'set'>> = {
      get: jest.fn().mockReturnValue({
        mode: 'patch',
        patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
        previewSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page' },
          },
        },
        previewSummary: '本次修改共 1 个 patch。',
        changeGroups: [],
        risk: {
          level: 'low',
          reasons: ['局部低范围修改'],
          patchOps: 1,
          distinctTargets: 1,
          requiresConfirmation: false,
        },
        requiresConfirmation: false,
        warnings: [],
        traceId: 'stale-patch',
        route: {
          requestedMode: 'patch',
          resolvedMode: 'patch',
          reason: 'manual_patch',
          manualOverride: true,
        },
      }),
      set: jest.fn(),
    };
    const traceService = new AgentTraceService();

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
      sessionMemoryService as unknown as AgentSessionMemoryService,
      readCacheService as unknown as AgentReadCacheService,
      idempotencyService as unknown as AgentIdempotencyService,
      traceService,
    );

    const result = await service.edit(
      {
        instruction: '把按钮改成提交',
        responseMode: 'patch',
        requestIdempotencyKey: 'session-1:msg-1',
      },
      'request-idempotent',
    );

    expect(runnerService.runEdit).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: 'patch',
      traceId: 'agent-idempotent',
    });
  });
});
