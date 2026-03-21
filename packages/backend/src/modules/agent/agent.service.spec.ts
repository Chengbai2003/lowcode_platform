import { AgentAnswerService } from './agent-answer.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentService } from './agent.service';

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

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
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

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
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
      },
      'agent-request-1',
      expect.objectContaining({
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

    const service = new AgentService(
      answerService as unknown as AgentAnswerService,
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
      routingService as unknown as AgentRoutingService,
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
      },
      'agent-request-2',
      expect.objectContaining({
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
});
