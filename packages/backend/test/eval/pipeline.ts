/**
 * Agent Eval — 确定性流水线（Issue #18 / M0-3）
 *
 * Patch 用例通过公开 AgentRunnerService.runEdit() 回放 Fixture Tool Call，
 * 执行真实 ToolExecution、Policy、AutoFix、PatchValidation 与 Preview 编排。
 * Draft/Validation/Safety/Conflict 保持为生产 Contract、安全校验器与 Repository CAS 探针。
 * Fixture 不调用真实模型、不使用凭据、不访问网络。
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { ConflictException } from '@nestjs/common';
import {
  AIToolCallingError,
  type AIService,
  type AIToolCallingResult,
} from '../../src/modules/ai/ai.service';
import { AgentRunnerService } from '../../src/modules/agent/agent-runner.service';
import { AgentIntentConfirmationService } from '../../src/modules/agent/agent-intent-confirmation.service';
import { AgentIntentNormalizationService } from '../../src/modules/agent/agent-intent-normalization.service';
import { AgentScopeConfirmationService } from '../../src/modules/agent/agent-scope-confirmation.service';
import { AgentTraceService } from '../../src/modules/agent/agent-trace.service';
import { requireValidPageSchema } from '../../src/modules/page-schema/schema-validation';
import { normalizeFinalPatch } from '../../src/modules/agent/agent-patch-normalizer.utils';
import { AgentPolicyService } from '../../src/modules/agent/agent-policy.service';
import { isSafeInlineExpression } from '../../src/modules/compiler/security/validators';
import { PageSchemaRepository } from '../../src/modules/page-schema/repositories/page-schema.repository';
import { PageSchemaService } from '../../src/modules/page-schema/page-schema.service';
import { PageRuntimeMetadataProvider } from '../../src/modules/page-schema/page-runtime-metadata.provider';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from '../../src/modules/page-schema/runtime-profiles';
import { PatchApplyService } from '../../src/modules/agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../../src/modules/agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../../src/modules/agent-tools/patch-validation.service';
import { ToolExecutionService } from '../../src/modules/agent-tools/tool-execution.service';
import { ToolRegistryService } from '../../src/modules/agent-tools/tool-registry.service';
import { ComponentMetaRegistry } from '../../src/modules/schema-context/component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from '../../src/modules/schema-context/collection-target-resolver.service';
import { ContextAssemblerService } from '../../src/modules/schema-context/context-assembler.service';
import { NodeLocatorService } from '../../src/modules/schema-context/node-locator.service';
import { SchemaResolverService } from '../../src/modules/schema-context/schema-resolver.service';
import { SchemaSlicerService } from '../../src/modules/schema-context/schema-slicer.service';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import type { EditorPatchOperation } from '../../src/modules/agent-tools/types/editor-patch.types';
import type { EvalCase, EvalCaseResult, ExpectedOutcome } from './eval-case.types';

/** 与 PageSchemaService 一致的可信运行时兼容元数据 */
const DRAFT_RUNTIME_COMPATIBILITY = BUILTIN_ANTD_RUNTIME_PROFILE;

function makePolicyService(): AgentPolicyService {
  // getLimits 只读常量与注入的 profile，不触网；依赖以最小桩注入
  return new AgentPolicyService(
    { get: () => undefined } as never,
    { getAllModels: () => [], getModel: () => undefined } as never,
  );
}

function makePatchValidationService(): PatchValidationService {
  return new PatchValidationService(new ComponentMetaRegistry(), new PatchApplyService());
}

const FIXTURE_PROVIDER = 'openai';

interface FixtureToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** 离线回放录制工具调用；执行仍经由 AgentRunner 提供的真实 executeTool。 */
export class FixtureAIService {
  readonly executedToolNames: string[] = [];

  constructor(private readonly patch: readonly EditorPatchOperation[]) {}

  async runToolCalling(
    input: Parameters<AIService['runToolCalling']>[0],
  ): Promise<AIToolCallingResult> {
    const calls = this.patch.map(toFixtureToolCall);
    const allowedToolNames = new Set(input.toolDefinitions.map((definition) => definition.name));
    const replayCalls = calls.slice(0, input.maxSteps);
    const stoppedAtStepLimit = replayCalls.length < calls.length;

    for (const [stepNumber, call] of replayCalls.entries()) {
      const toolCallCount = stepNumber + 1;
      if (toolCallCount > input.maxToolCalls) {
        throw new AIToolCallingError('policy', 'Tool call limit exceeded', {
          toolCallCount,
          maxToolCalls: input.maxToolCalls,
        });
      }
      if (!allowedToolNames.has(call.name)) {
        throw new AIToolCallingError('policy', `Fixture tool is not active: ${call.name}`, {
          toolName: call.name,
        });
      }

      input.onToolCallStart?.({ stepNumber, toolCall: { toolName: call.name } });
      try {
        await input.executeTool(call.name, call.input);
      } catch (error) {
        input.onToolCallFinish?.({
          stepNumber,
          toolCall: { toolName: call.name },
          success: false,
        });
        if (error instanceof AIToolCallingError) {
          throw error;
        }
        throw new AIToolCallingError(
          'policy',
          error instanceof Error ? error.message : 'Tool calling request failed',
          {
            toolCallCount,
            causeName: error instanceof Error ? error.name : 'UnknownError',
          },
        );
      }
      this.executedToolNames.push(call.name);
      input.onToolCallFinish?.({ stepNumber, toolCall: { toolName: call.name }, success: true });
      input.onStepFinish?.({
        stepNumber,
        finishReason:
          !stoppedAtStepLimit && stepNumber === replayCalls.length - 1 ? 'stop' : 'tool_calls',
        toolCalls: [{ toolName: call.name }],
      });
    }
    return {
      text: 'fixture replay',
      finishReason: stoppedAtStepLimit ? 'tool_calls' : 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      warnings: [],
      steps: replayCalls.map((call, stepNumber) => ({
        stepNumber,
        finishReason:
          !stoppedAtStepLimit && stepNumber === replayCalls.length - 1 ? 'stop' : 'tool_calls',
        toolCalls: [{ toolName: call.name }],
      })),
      toolCallCount: replayCalls.length,
    };
  }
}

function toFixtureToolCall(operation: EditorPatchOperation): FixtureToolCall {
  switch (operation.op) {
    case 'insertComponent':
      return {
        name: 'insert_component',
        input: {
          parentId: operation.parentId,
          ...(operation.index === undefined ? {} : { index: operation.index }),
          component: operation.component,
        },
      };
    case 'updateProps':
      return {
        name: 'update_component_props',
        input: { componentId: operation.componentId, props: operation.props },
      };
    case 'bindEvent':
      return {
        name: 'bind_event',
        input: {
          componentId: operation.componentId,
          event: operation.event,
          actions: operation.actions,
        },
      };
    case 'removeComponent':
      return { name: 'remove_component', input: { componentId: operation.componentId } };
    case 'moveComponent':
      return {
        name: 'move_component',
        input: {
          componentId: operation.componentId,
          newParentId: operation.newParentId,
          newIndex: operation.newIndex,
        },
      };
  }
}

function selectedIdForPatch(operation: EditorPatchOperation): string {
  return operation.op === 'insertComponent' ? operation.parentId : operation.componentId;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 以 expected 的键集为准，从 actual 中取同键并逐键比较。
 * 缺键或值不等都记入 mismatches。
 */
function alignAndCompare(
  expected: ExpectedOutcome,
  actual: Record<string, unknown>,
): { aligned: Record<string, unknown>; matches: boolean; mismatches: string[] } {
  const aligned: Record<string, unknown> = {};
  const mismatches: string[] = [];
  for (const key of Object.keys(expected)) {
    const actualValue = actual[key];
    aligned[key] = actualValue;
    const expectedValue = (expected as Record<string, unknown>)[key];
    // blockedReason 语义为“拦截原因子串”：expected 只需出现在 actual 中
    const isSubstringMatch =
      key === 'blockedReason' &&
      typeof expectedValue === 'string' &&
      typeof actualValue === 'string' &&
      actualValue.includes(expectedValue);
    if (!isSubstringMatch && !deepEqual(actualValue, expectedValue)) {
      mismatches.push(
        `${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
  }
  return { aligned, matches: mismatches.length === 0, mismatches };
}

function makeResult(kase: EvalCase, actual: Record<string, unknown>): EvalCaseResult {
  const { aligned, matches, mismatches } = alignAndCompare(kase.expected, actual);
  return {
    id: kase.id,
    category: kase.category,
    title: kase.title,
    actual: aligned,
    matchesExpected: matches,
    mismatches,
  };
}

interface SchemaProbeOutcome {
  schemaValid: boolean;
  blocked: boolean;
  blockedReason?: string;
  componentIds?: string[];
}

function probeSchema(input: unknown): SchemaProbeOutcome {
  try {
    const canonical = requireValidPageSchema(input);
    return {
      schemaValid: true,
      blocked: false,
      componentIds: Object.keys(canonical.components).sort(),
    };
  } catch (error) {
    return {
      schemaValid: false,
      blocked: true,
      blockedReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runDraftCase(kase: EvalCase): Promise<EvalCaseResult> {
  const probe = probeSchema(kase.fixtures.modelOutputSchema);
  return makeResult(kase, probe as unknown as Record<string, unknown>);
}

export async function replayPatchThroughAgent(kase: EvalCase): Promise<{
  response: Awaited<ReturnType<AgentRunnerService['runEdit']>>;
  fixtureToolNames: readonly string[];
}> {
  // ponytail: Repository 目前只从进程 env 读取存储路径；Eval Jest 因此固定 --runInBand。
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-eval-runner-'));
  const previousPath = process.env.PAGE_SCHEMA_FILE_PATH;
  const patch = kase.fixtures.patch as EditorPatchOperation[];
  const firstOperation = patch[0];
  if (!firstOperation) {
    throw new Error(
      `Eval case ${kase.id}: production replay requires at least one patch operation`,
    );
  }
  try {
    const storePath = join(tempDir, 'page-schema-store.json');
    await writeFile(storePath, JSON.stringify({ pages: [], snapshots: [] }), 'utf-8');
    process.env.PAGE_SCHEMA_FILE_PATH = storePath;
    const repository = new PageSchemaRepository();
    await repository.onModuleInit();
    const pageSchemaService = new PageSchemaService(repository, new PageRuntimeMetadataProvider());
    const pageId = `eval-${kase.id}`;
    const saved = await pageSchemaService.saveSchema({ pageId, schema: kase.fixtures.baseSchema });
    const componentMetaRegistry = new ComponentMetaRegistry();
    const collectionTargetResolver = new CollectionTargetResolverService(componentMetaRegistry);
    const contextAssembler = new ContextAssemblerService(
      new SchemaResolverService(pageSchemaService),
      new NodeLocatorService(componentMetaRegistry),
      new SchemaSlicerService(),
      componentMetaRegistry,
    );
    const patchValidationService = new PatchValidationService(
      componentMetaRegistry,
      new PatchApplyService(),
    );
    const toolRegistry = new ToolRegistryService(
      contextAssembler,
      componentMetaRegistry,
      collectionTargetResolver,
      new PatchAutoFixService(),
      patchValidationService,
    );
    const fixtureAI = new FixtureAIService(patch);
    const runner = new AgentRunnerService(
      fixtureAI as unknown as AIService,
      new ToolExecutionService(pageSchemaService, contextAssembler, toolRegistry),
      toolRegistry,
      makePolicyService(),
      componentMetaRegistry,
      collectionTargetResolver,
      new AgentIntentNormalizationService(collectionTargetResolver),
      new AgentIntentConfirmationService(),
      new AgentScopeConfirmationService(),
      new AgentTraceService(),
    );
    const response = await runner.runEdit(
      {
        instruction: kase.intent,
        pageId,
        pageVersion: saved.pageVersion,
        selectedId: selectedIdForPatch(firstOperation),
        responseMode: 'patch',
        provider: FIXTURE_PROVIDER,
      },
      `eval-${kase.id}`,
      { executionPath: 'tool_call' },
    );
    return { response, fixtureToolNames: fixtureAI.executedToolNames };
  } finally {
    if (previousPath === undefined) delete process.env.PAGE_SCHEMA_FILE_PATH;
    else process.env.PAGE_SCHEMA_FILE_PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runPatchCase(kase: EvalCase): Promise<EvalCaseResult> {
  const patch = kase.fixtures.patch as EditorPatchOperation[];
  const replay = await replayPatchThroughAgent(kase);
  const expectedToolNames = patch.map(toFixtureToolCall).map((call) => call.name);
  if (!deepEqual(replay.fixtureToolNames, expectedToolNames)) {
    throw new Error(
      `Eval case ${kase.id}: expected fixture tools ${JSON.stringify(expectedToolNames)}, got ${JSON.stringify(replay.fixtureToolNames)}`,
    );
  }
  if (replay.response.mode !== 'patch') {
    throw new Error(
      `Eval case ${kase.id}: AgentRunner returned ${replay.response.mode}, expected patch`,
    );
  }
  const finalSchema = replay.response.previewSchema;
  const actual: Record<string, unknown> = {
    submittedOps: patch.length,
    normalizedOps: replay.response.patch.length,
    riskLevel: replay.response.risk.level,
    schemaValid: true,
  };

  if (kase.expected.componentExists) {
    actual.componentExists = kase.expected.componentExists.filter((id) =>
      Boolean(finalSchema.components[id]),
    );
  }

  if (kase.expected.componentMissing) {
    actual.componentMissing = kase.expected.componentMissing.filter(
      (id) => !finalSchema.components[id],
    );
  }

  if (kase.expected.props) {
    const actualProps: Record<string, Record<string, unknown>> = {};
    for (const [id, expectedComponentProps] of Object.entries(kase.expected.props)) {
      const component = finalSchema.components[id];
      if (component && component.props) {
        actualProps[id] = {};
        for (const propKey of Object.keys(expectedComponentProps)) {
          actualProps[id][propKey] = component.props[propKey];
        }
      }
    }
    actual.props = actualProps;
  }

  if (kase.expected.events) {
    const actualEvents: Record<string, Record<string, unknown[]>> = {};
    for (const [id, expectedComponentEvents] of Object.entries(kase.expected.events)) {
      const component = finalSchema.components[id];
      if (component && component.events) {
        actualEvents[id] = {};
        for (const eventKey of Object.keys(expectedComponentEvents)) {
          actualEvents[id][eventKey] = component.events[eventKey] as unknown[];
        }
      }
    }
    actual.events = actualEvents;
  }

  return makeResult(kase, actual);
}

async function runValidationCase(kase: EvalCase): Promise<EvalCaseResult> {
  if (kase.fixtures.schema !== undefined || kase.fixtures.modelOutputSchema !== undefined) {
    const probe = probeSchema(kase.fixtures.schema ?? kase.fixtures.modelOutputSchema);
    return makeResult(kase, probe as unknown as Record<string, unknown>);
  }

  if (kase.fixtures.patch !== undefined) {
    const baseSchema = requireValidPageSchema(kase.fixtures.baseSchema);
    const patch = kase.fixtures.patch as EditorPatchOperation[];
    try {
      const normalized = normalizeFinalPatch(baseSchema, patch);
      makePolicyService().assertPatchWithinLimits(normalized, `eval-${kase.id}`, 'normal_patch');
      makePatchValidationService().validatePatchShape(normalized, `eval-${kase.id}`);
      return makeResult(kase, { blocked: false, normalizedOps: normalized.length });
    } catch (error) {
      return makeResult(kase, {
        blocked: true,
        blockedReason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(`Eval case ${kase.id}: validation category requires schema or patch fixtures`);
}

async function runSafetyCase(kase: EvalCase): Promise<EvalCaseResult> {
  if (kase.fixtures.expression !== undefined) {
    const safe = isSafeInlineExpression(kase.fixtures.expression);
    return makeResult(kase, {
      blocked: !safe,
      blockedReason: safe ? undefined : 'expression rejected by security validators',
    });
  }
  if (kase.fixtures.modelOutputSchema !== undefined) {
    const probe = probeSchema(kase.fixtures.modelOutputSchema);
    return makeResult(kase, probe as unknown as Record<string, unknown>);
  }
  throw new Error(`Eval case ${kase.id}: safety category requires expression or schema fixtures`);
}

interface ConflictProbe {
  finalVersion: number;
  staleBaseConflict?: boolean;
  missingBaseConflict?: boolean;
}

async function probeConflicts(
  baseSchema: unknown,
  steps: NonNullable<EvalCase['fixtures']['steps']>,
): Promise<ConflictProbe> {
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-eval-cas-'));
  const previousPath = process.env.PAGE_SCHEMA_FILE_PATH;
  try {
    const storePath = join(tempDir, 'page-schema-store.json');
    await writeFile(storePath, JSON.stringify({ pages: [], snapshots: [] }), 'utf-8');
    process.env.PAGE_SCHEMA_FILE_PATH = storePath;

    const repository = new PageSchemaRepository();
    await repository.onModuleInit();

    const schema = requireValidPageSchema(baseSchema);
    const saveParams = {
      pageId: 'eval-page',
      schema,
      systemId: 'default',
      runtimeCompatibility: DRAFT_RUNTIME_COMPATIBILITY,
    };

    const probe: ConflictProbe = { finalVersion: 0 };
    let currentVersion = 0;

    for (const step of steps) {
      try {
        const basePageVersion =
          step === 'saveWithCurrentBase'
            ? currentVersion
            : step === 'saveStaleBase'
              ? Math.max(currentVersion - 1, 0)
              : undefined;
        const saved = await repository.saveSchema({ ...saveParams, basePageVersion });
        currentVersion = saved.page.currentPageVersion;
        if (step === 'saveStaleBase') probe.staleBaseConflict = false;
        if (step === 'saveMissingBase') probe.missingBaseConflict = false;
      } catch (error) {
        const conflict = error instanceof ConflictException;
        if (step === 'saveStaleBase') probe.staleBaseConflict = conflict;
        else if (step === 'saveMissingBase') probe.missingBaseConflict = conflict;
        else if (!conflict) throw error;
      }
    }

    probe.finalVersion = currentVersion;
    return probe;
  } finally {
    if (previousPath === undefined) {
      delete process.env.PAGE_SCHEMA_FILE_PATH;
    } else {
      process.env.PAGE_SCHEMA_FILE_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runConflictCase(kase: EvalCase): Promise<EvalCaseResult> {
  const steps = kase.fixtures.steps ?? [
    'save',
    'saveWithCurrentBase',
    'saveStaleBase',
    'saveMissingBase',
  ];
  const probe = await probeConflicts(kase.fixtures.baseSchema, steps);
  return makeResult(kase, probe as unknown as Record<string, unknown>);
}

export async function runEvalCase(kase: EvalCase): Promise<EvalCaseResult> {
  switch (kase.category) {
    case 'draft':
      return runDraftCase(kase);
    case 'patch':
      return runPatchCase(kase);
    case 'validation':
      return runValidationCase(kase);
    case 'conflict':
      return runConflictCase(kase);
    case 'safety':
      return runSafetyCase(kase);
    default:
      throw new Error(`Eval case ${kase.id}: unknown category ${(kase as EvalCase).category}`);
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => [key, sortDeep(val)]),
    );
  }
  return value;
}

/** 结果的可复现序列化：键序归一后比较（Replay Reproducibility） */
export function serializeResult(result: EvalCaseResult): string {
  return JSON.stringify(
    sortDeep({
      id: result.id,
      category: result.category,
      actual: result.actual,
      matchesExpected: result.matchesExpected,
    }),
  );
}
