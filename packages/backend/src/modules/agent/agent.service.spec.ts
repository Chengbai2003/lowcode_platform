import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentService } from './agent.service';

describe('AgentService', () => {
  it('routes schema mode requests to the legacy schema service', async () => {
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn().mockResolvedValue({
        mode: 'schema',
        content: '{}',
        warnings: [],
        traceId: 'agent-trace',
      }),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn(),
    };

    const service = new AgentService(
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
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
      'request-1',
    );
    expect(runnerService.runEdit).not.toHaveBeenCalled();
    expect(result.mode).toBe('schema');
  });

  it('routes patch mode requests to the bounded agent runner', async () => {
    const legacySchemaService: jest.Mocked<Pick<AgentLegacySchemaService, 'edit'>> = {
      edit: jest.fn(),
    };
    const runnerService: jest.Mocked<Pick<AgentRunnerService, 'runEdit'>> = {
      runEdit: jest.fn().mockResolvedValue({
        mode: 'patch',
        patch: [],
        warnings: [],
        traceId: 'agent-trace',
      }),
    };

    const service = new AgentService(
      legacySchemaService as unknown as AgentLegacySchemaService,
      runnerService as unknown as AgentRunnerService,
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
      'request-2',
    );
    expect(legacySchemaService.edit).not.toHaveBeenCalled();
    expect(result.mode).toBe('patch');
  });
});
