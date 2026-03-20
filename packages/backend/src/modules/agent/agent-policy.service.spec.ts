import { ConfigService } from '@nestjs/config';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { ModelConfigService } from '../ai/model-config.service';
import { AgentPolicyService } from './agent-policy.service';

function getErrorCode(error: unknown): string {
  return ((error as AgentToolException).getResponse() as { code: string }).code;
}

describe('AgentPolicyService', () => {
  function createService(defaultProvider = 'openai') {
    const configService: jest.Mocked<Pick<ConfigService, 'get'>> = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'ai.defaultProvider') {
          return defaultProvider;
        }
        return fallback as any;
      }),
    };
    const modelConfigService: jest.Mocked<Pick<ModelConfigService, 'getModel'>> = {
      getModel: jest.fn(),
    };

    return new AgentPolicyService(
      configService as unknown as ConfigService,
      modelConfigService as unknown as ModelConfigService,
    );
  }

  it('blocks patch mode requests without pageId', () => {
    const service = createService();

    expect(() =>
      service.assertPatchRequestAllowed(
        {
          instruction: '更新按钮',
          version: 3,
          responseMode: 'patch',
        },
        'trace-1',
      ),
    ).toThrow(AgentToolException);

    try {
      service.assertPatchRequestAllowed(
        {
          instruction: '更新按钮',
          version: 3,
          responseMode: 'patch',
        },
        'trace-1',
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe('AGENT_POLICY_BLOCKED');
    }
  });

  it('blocks providers that are not enabled for patch mode', () => {
    const service = createService();

    expect(() =>
      service.assertPatchRequestAllowed(
        {
          instruction: '更新按钮',
          pageId: 'page-1',
          version: 3,
          provider: 'ollama',
          responseMode: 'patch',
        },
        'trace-1',
      ),
    ).toThrow(AgentToolException);
  });

  it('blocks patches that exceed size limits', () => {
    const service = createService();

    expect(() =>
      service.assertPatchWithinLimits(
        [
          { op: 'updateProps', componentId: 'a', props: {} },
          { op: 'updateProps', componentId: 'b', props: {} },
          { op: 'updateProps', componentId: 'c', props: {} },
          { op: 'updateProps', componentId: 'd', props: {} },
          { op: 'updateProps', componentId: 'e', props: {} },
          { op: 'updateProps', componentId: 'f', props: {} },
          { op: 'updateProps', componentId: 'g', props: {} },
        ],
        'trace-1',
      ),
    ).toThrow(AgentToolException);
  });

  it('throws AGENT_TIMEOUT with metrics details', () => {
    const service = createService();

    expect(() => service.throwTimeout('trace-1', { stepCount: 3, toolCallCount: 4 })).toThrow(
      AgentToolException,
    );

    try {
      service.throwTimeout('trace-1', { stepCount: 3, toolCallCount: 4 });
    } catch (error) {
      expect(getErrorCode(error)).toBe('AGENT_TIMEOUT');
      expect(((error as AgentToolException).getResponse() as any).details).toMatchObject({
        stepCount: 3,
        toolCallCount: 4,
      });
    }
  });
});
