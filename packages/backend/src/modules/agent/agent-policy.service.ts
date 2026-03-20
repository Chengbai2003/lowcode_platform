import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelConfigService } from '../ai/model-config.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { AgentEditRequestDto } from './dto/agent-edit-request.dto';

export interface AgentPolicyLimits {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxPatchOps: number;
  maxDistinctTargets: number;
}

export interface AgentRunMetrics {
  stepCount: number;
  toolCallCount: number;
}

const PATCH_ENABLED_PROVIDERS = new Set(['openai', 'anthropic']);
const AGENT_TIMEOUT_MS = 60_000;

@Injectable()
export class AgentPolicyService {
  constructor(
    private readonly configService: ConfigService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  getLimits(): AgentPolicyLimits {
    return {
      maxSteps: 6,
      maxToolCalls: 8,
      timeoutMs: AGENT_TIMEOUT_MS,
      maxPatchOps: 6,
      maxDistinctTargets: 4,
    };
  }

  createTraceId(requestId?: string): string {
    if (requestId?.trim()) {
      return requestId.startsWith('agent-') ? requestId : `agent-${requestId}`;
    }
    return `agent-${Date.now().toString(36)}`;
  }

  assertPatchRequestAllowed(dto: AgentEditRequestDto, traceId: string) {
    if (!dto.pageId?.trim()) {
      throw new AgentToolException({
        code: 'AGENT_POLICY_BLOCKED',
        message: 'Patch mode requires pageId',
        traceId,
        details: { reason: 'pageId is required in patch mode' },
      });
    }

    if (dto.version === undefined) {
      throw new AgentToolException({
        code: 'AGENT_POLICY_BLOCKED',
        message: 'Patch mode requires version',
        traceId,
        details: { reason: 'version is required in patch mode' },
      });
    }

    const resolvedProvider = this.resolveRequestedProvider(dto);
    if (!PATCH_ENABLED_PROVIDERS.has(resolvedProvider)) {
      throw new AgentToolException({
        code: 'AGENT_POLICY_BLOCKED',
        message: `Provider ${resolvedProvider} is not enabled for patch mode`,
        traceId,
        details: {
          reason: 'provider does not support bounded tool calling in phase 4',
          provider: resolvedProvider,
        },
      });
    }
  }

  assertPatchProduced(patch: readonly EditorPatchOperation[], traceId: string) {
    if (patch.length > 0) {
      return;
    }

    throw new AgentToolException({
      code: 'AGENT_POLICY_BLOCKED',
      message: 'Agent finished without producing a patch',
      traceId,
      details: { reason: 'empty patch is blocked in patch mode' },
    });
  }

  assertPatchWithinLimits(patch: readonly EditorPatchOperation[], traceId: string) {
    const limits = this.getLimits();
    if (patch.length > limits.maxPatchOps) {
      throw new AgentToolException({
        code: 'AGENT_POLICY_BLOCKED',
        message: `Patch exceeds maximum operation count ${limits.maxPatchOps}`,
        traceId,
        details: {
          reason: 'patch operation count exceeded',
          patchOps: patch.length,
          maxPatchOps: limits.maxPatchOps,
        },
      });
    }

    const distinctTargets = this.countDistinctTargets(patch);
    if (distinctTargets > limits.maxDistinctTargets) {
      throw new AgentToolException({
        code: 'AGENT_POLICY_BLOCKED',
        message: `Patch exceeds maximum distinct target count ${limits.maxDistinctTargets}`,
        traceId,
        details: {
          reason: 'patch target spread exceeded',
          distinctTargets,
          maxDistinctTargets: limits.maxDistinctTargets,
        },
      });
    }
  }

  throwTimeout(traceId: string, metrics: AgentRunMetrics) {
    const limits = this.getLimits();
    throw new AgentToolException({
      code: 'AGENT_TIMEOUT',
      message: 'Agent run timed out',
      traceId,
      details: {
        timeoutMs: limits.timeoutMs,
        stepCount: metrics.stepCount,
        toolCallCount: metrics.toolCallCount,
      },
    });
  }

  throwPolicyBlocked(traceId: string, reason: string, details?: Record<string, unknown>) {
    throw new AgentToolException({
      code: 'AGENT_POLICY_BLOCKED',
      message: reason,
      traceId,
      details: {
        reason,
        ...(details ?? {}),
      },
    });
  }

  private resolveRequestedProvider(dto: AgentEditRequestDto): string {
    if (dto.modelId) {
      const customModel = this.modelConfigService.getModel(dto.modelId);
      if (customModel?.provider) {
        return customModel.provider;
      }

      if (dto.modelId === 'openai' || dto.modelId === 'anthropic' || dto.modelId === 'ollama') {
        return dto.modelId;
      }
    }

    if (dto.provider?.trim()) {
      return dto.provider;
    }

    return this.configService.get<string>('ai.defaultProvider', 'openai');
  }

  private countDistinctTargets(patch: readonly EditorPatchOperation[]): number {
    const targets = new Set<string>();

    for (const operation of patch) {
      switch (operation.op) {
        case 'insertComponent':
          targets.add(operation.parentId);
          break;
        case 'updateProps':
        case 'bindEvent':
        case 'removeComponent':
          targets.add(operation.componentId);
          break;
        case 'moveComponent':
          targets.add(operation.componentId);
          targets.add(operation.newParentId);
          break;
      }
    }

    return targets.size;
  }
}
