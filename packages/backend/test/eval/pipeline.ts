/**
 * Agent Eval — 确定性流水线（Issue #18 / M0-3）
 *
 * 每个用例经 Agent 真实的确定性后处理管线执行（Contract 校验、
 * Patch 归一化、风险评估、安全校验器、Repository CAS），
 * 模型输出以录制 Fixture 回放，不调用真实模型、不访问网络。
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { ConflictException } from '@nestjs/common';
import { requireValidPageSchema } from '../../src/modules/page-schema/schema-validation';
import { normalizeFinalPatch } from '../../src/modules/agent/agent-patch-normalizer.utils';
import { assessPatchRisk } from '../../src/modules/agent/agent-preview.utils';
import { AgentPolicyService } from '../../src/modules/agent/agent-policy.service';
import { isSafeInlineExpression } from '../../src/modules/compiler/security/validators';
import { PageSchemaRepository } from '../../src/modules/page-schema/repositories/page-schema.repository';
import { PatchApplyService } from '../../src/modules/agent-tools/patch-apply.service';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import type { EditorPatchOperation } from '../../src/modules/agent-tools/types/editor-patch.types';
import type { EvalCase, EvalCaseResult, ExpectedOutcome } from './eval-case.types';

/** 与 PageSchemaService Draft Provider 一致的可信运行时兼容元数据 */
const DRAFT_RUNTIME_COMPATIBILITY = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.0.0-draft',
  rendererVersion: '0.0.0-draft',
};

function makePolicyService(): AgentPolicyService {
  // getLimits 只读常量与注入的 profile，不触网；依赖以最小桩注入
  return new AgentPolicyService(
    { get: () => undefined } as never,
    { getAllModels: () => [], getModel: () => undefined } as never,
  );
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

async function runPatchCase(kase: EvalCase): Promise<EvalCaseResult> {
  const baseSchema = requireValidPageSchema(kase.fixtures.baseSchema);
  const patch = kase.fixtures.patch as EditorPatchOperation[];
  const normalized = normalizeFinalPatch(baseSchema, patch);
  const risk = assessPatchRisk(baseSchema, normalized);

  // 1. 真实调用 PatchApplyService 执行补丁应用
  const patchApplyService = new PatchApplyService();
  const rawPatchedSchema = patchApplyService.applyPatch(baseSchema, normalized);

  // 2. 补丁结果经 Contract 严格校验（Fail-Close 保证规范性）
  let finalSchema: PageSchema;
  let schemaValid = false;
  try {
    finalSchema = requireValidPageSchema(rawPatchedSchema);
    schemaValid = true;
  } catch (err) {
    return makeResult(kase, {
      submittedOps: patch.length,
      normalizedOps: normalized.length,
      riskLevel: risk.level,
      schemaValid: false,
      blocked: true,
      blockedReason: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. 构建包含实际语义指标的 actual 结果
  const actual: Record<string, unknown> = {
    submittedOps: patch.length,
    normalizedOps: normalized.length,
    riskLevel: risk.level,
    schemaValid,
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
    const policy = makePolicyService();
    const limits = policy.getLimits('normal_patch');
    if (patch.length > limits.maxPatchOps) {
      return makeResult(kase, {
        blocked: true,
        blockedReason: `patch ops ${patch.length} exceed policy limit ${limits.maxPatchOps}`,
      });
    }
    try {
      const normalized = normalizeFinalPatch(baseSchema, patch);
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
