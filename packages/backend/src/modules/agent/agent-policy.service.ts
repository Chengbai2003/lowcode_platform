import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelConfigService } from '../ai/model-config.service';
import { AgentToolException } from '../agent-tools/agent-tool.exception';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { FocusContextResult } from '../schema-context';
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

export type AgentPatchRunProfile =
  | 'fast_path'
  | 'simple_patch'
  | 'normal_patch'
  | 'complex_patch'
  | 'batch_patch';

const PATCH_ENABLED_PROVIDERS = new Set(['openai', 'anthropic']);
const AGENT_TIMEOUT_MS = 60_000;
const STRUCTURE_KEYWORDS = ['新增', '添加', '插入', '删除', '移除', '移动', '移到', '绑定', '事件'];
const SIMPLE_UPDATE_KEYWORDS = ['改成', '改为', '换成', '变成', '隐藏', '显示', '文案', '标题'];

@Injectable()
export class AgentPolicyService {
  constructor(
    private readonly configService: ConfigService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  getLimits(profile: AgentPatchRunProfile = 'normal_patch'): AgentPolicyLimits {
    const base = {
      timeoutMs: AGENT_TIMEOUT_MS,
      maxPatchOps: 6,
      maxDistinctTargets: 4,
    };

    switch (profile) {
      case 'fast_path':
        return {
          ...base,
          maxSteps: 1,
          maxToolCalls: 2,
        };
      case 'simple_patch':
        return {
          ...base,
          maxSteps: 4,
          maxToolCalls: 4,
        };
      case 'complex_patch':
        return {
          ...base,
          maxSteps: 8,
          maxToolCalls: 10,
        };
      case 'batch_patch':
        return {
          ...base,
          maxSteps: 4,
          maxToolCalls: 3,
          maxPatchOps: 10,
          maxDistinctTargets: 10,
        };
      case 'normal_patch':
      default:
        return {
          ...base,
          maxSteps: 6,
          maxToolCalls: 8,
        };
    }
  }

  selectPatchRunProfile(input: {
    instruction: string;
    selectedId?: string;
    focusContextResult?: FocusContextResult;
  }): AgentPatchRunProfile {
    const normalizedInstruction = input.instruction.trim().toLowerCase();
    const hasExplicitTarget =
      Boolean(input.selectedId?.trim()) || input.focusContextResult?.mode === 'focused';
    const hasCandidateAmbiguity =
      input.focusContextResult?.mode === 'candidates' &&
      (input.focusContextResult.candidates?.length ?? 0) > 1;

    if (
      hasExplicitTarget &&
      SIMPLE_UPDATE_KEYWORDS.some((keyword) => normalizedInstruction.includes(keyword))
    ) {
      return 'fast_path';
    }

    if (STRUCTURE_KEYWORDS.some((keyword) => normalizedInstruction.includes(keyword))) {
      return hasCandidateAmbiguity ? 'complex_patch' : 'normal_patch';
    }

    if (hasExplicitTarget) {
      return 'simple_patch';
    }

    return hasCandidateAmbiguity ? 'complex_patch' : 'normal_patch';
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

  assertPatchWithinLimits(
    patch: readonly EditorPatchOperation[],
    traceId: string,
    profile: AgentPatchRunProfile = 'normal_patch',
  ) {
    const limits = this.getLimits(profile);
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

  throwTimeout(traceId: string, metrics: AgentRunMetrics): never {
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

  throwPolicyBlocked(traceId: string, reason: string, details?: Record<string, unknown>): never {
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
