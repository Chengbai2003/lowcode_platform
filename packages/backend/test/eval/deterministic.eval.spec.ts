/**
 * Agent Deterministic Eval（Issue #18 / M0-3）
 *
 * 入口：`pnpm eval:deterministic`（jest --config ./test/eval/jest.eval.config.js）
 * - 无网络、无模型凭据即可运行（模型输出以 Fixture 回放）；
 * - 同一代码 + Fixtures 跑两遍，逐键比对（Replay Reproducibility）；
 * - 输出机器可读 JSON 与人类可读 Markdown 报告；
 * - Expected Outcome Rate < 100% 或可复现性 < 100% 时失败（CI 阻断）。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { CURRENT_DRAFT_SCHEMA_VERSION } from '@lowcode-platform/schema-contract';
import { ANTD_MANIFEST_VERSION } from '@lowcode-platform/preset-antd';
import { DEPLOYMENT_RUNTIME_PROFILE_REGISTRY } from '../../src/modules/runtime-profile/deployment-runtime-profile-registry';
import {
  FIXTURE_REPLAY_INSTRUCTION_VERSION,
  FIXTURE_TOOL_MANIFEST_VERSION,
  runEvalCase,
  serializeResult,
} from './pipeline';
import { computeMetrics, type EvalReplayObservations } from './metrics';
import { writeReports } from './report';
import { validateEvalCase } from './case-contract';
import { createEvalRunReport, type EvalRunReport, type EvalReportCase } from './report-contract';
import {
  BASELINE_CASE_QUOTAS,
  EVAL_CASE_SCHEMA_VERSION,
  type EvalCase,
  type EvalCaseResult,
} from './eval-case.types';

const CASES_DIR = join(__dirname, 'cases');

function loadCases(): EvalCase[] {
  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.case.json'))
    .sort();
  const ids = new Set<string>();
  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf-8')) as EvalCase;
    if (raw.caseSchemaVersion !== EVAL_CASE_SCHEMA_VERSION) {
      throw new Error(
        `Eval case ${raw.id}: caseSchemaVersion ${raw.caseSchemaVersion} != expected ${EVAL_CASE_SCHEMA_VERSION}`,
      );
    }
    validateEvalCase(raw, ids);
    return raw;
  });
}

function revision(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: join(__dirname, '../../..') })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function contractPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../../../schema-contract/package.json'), 'utf-8'),
  ) as { version: string };
  return pkg.version;
}

async function runAll(cases: EvalCase[]): Promise<EvalCaseResult[]> {
  const results: EvalCaseResult[] = [];
  for (const kase of cases) {
    const startedAt = Date.now();
    try {
      const result = await runEvalCase(kase);
      results.push({
        ...result,
        telemetry: result.telemetry ?? unavailableTelemetry(Date.now() - startedAt),
      });
    } catch (error) {
      results.push({
        id: kase.id,
        category: kase.category,
        title: kase.title,
        status: 'infra_error',
        actual: {},
        matchesExpected: false,
        mismatches: [error instanceof Error ? error.message : String(error)],
        telemetry: unavailableTelemetry(Date.now() - startedAt),
      });
    }
  }
  return results;
}

function unavailableTelemetry(latencyMs: number): EvalReportCase['telemetry'] {
  return {
    latencyMs,
    usage: null,
    cost: null,
    toolCalls: null,
    repairCount: null,
  };
}

function uniqueResultsById(results: readonly EvalCaseResult[]): Map<string, EvalCaseResult> | null {
  const byId = new Map<string, EvalCaseResult>();
  for (const result of results) {
    if (byId.has(result.id)) return null;
    byId.set(result.id, result);
  }
  return byId;
}

function buildReplayObservations(
  firstRun: readonly EvalCaseResult[],
  secondRun: readonly EvalCaseResult[],
): EvalReplayObservations {
  if (firstRun.length !== secondRun.length) return null;
  const firstById = uniqueResultsById(firstRun);
  const secondById = uniqueResultsById(secondRun);
  if (firstById === null || secondById === null) return null;
  if (![...firstById.keys()].every((id) => secondById.has(id))) return null;

  return firstRun.map((result) => ({
    id: result.id,
    reproducible:
      serializeResult(result) === serializeResult(secondById.get(result.id) as EvalCaseResult),
  }));
}

function buildReport(
  cases: EvalCase[],
  results: EvalCaseResult[],
  replay: EvalReplayObservations,
): EvalRunReport {
  const runtimeProfile = DEPLOYMENT_RUNTIME_PROFILE_REGISTRY.resolveSystem('default');
  return createEvalRunReport({
    run: {
      runId: `deterministic-${Date.now().toString(36)}`,
      mode: 'deterministic',
      generatedAt: new Date().toISOString(),
      revision: revision(),
      revisionSource: 'local_checkout',
      provider: 'fixture',
      model: null,
      modelSelectionSource: 'fixture',
    },
    environment: {
      contract: {
        packageVersion: contractPackageVersion(),
        packageVersionSource: 'local_checkout',
        pageSchemaVersion: CURRENT_DRAFT_SCHEMA_VERSION,
        evalCaseSchemaVersion: EVAL_CASE_SCHEMA_VERSION,
      },
      runtimeCompatibility: {
        componentPresetId: runtimeProfile.componentPresetId,
        componentPresetVersion: runtimeProfile.componentPresetVersion,
        rendererVersion: runtimeProfile.rendererVersion,
      },
      sourceVersions: {
        prompt: FIXTURE_REPLAY_INSTRUCTION_VERSION,
        tool: FIXTURE_TOOL_MANIFEST_VERSION,
        manifest: ANTD_MANIFEST_VERSION,
        source: 'local_checkout',
      },
    },
    metrics: computeMetrics(results, replay),
    cases: results,
  });
}

describe('Agent deterministic eval (M0-3)', () => {
  let cases: EvalCase[];
  let firstRun: EvalCaseResult[];
  let secondRun: EvalCaseResult[];

  beforeAll(async () => {
    cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
    firstRun = await runAll(cases);
    secondRun = await runAll(cases);
  });

  it('基线用例覆盖 M0 配额：draft 4 / patch 6 / validation 4 / conflict 3 / safety 3', () => {
    const counts = new Map<string, number>();
    for (const kase of cases) {
      counts.set(kase.category, (counts.get(kase.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual(BASELINE_CASE_QUOTAS);
    expect(cases.length).toBe(20);
  });

  it('每个用例的 ExpectedOutcome 与实际结果一致', () => {
    const failures = firstRun.filter((r) => !r.matchesExpected);
    const message = failures.map((r) => `${r.id}: ${r.mismatches.join('; ')}`).join('\n');
    expect(message).toBe('');
  });

  it('相同代码与 Fixtures 两次运行结果完全一致（Replay Reproducibility）', () => {
    const replay = buildReplayObservations(firstRun, secondRun);

    expect(replay).not.toBeNull();
    expect(replay?.every((result) => result.reproducible)).toBe(true);
  });

  it('两次运行的 Case ID 不能一一对应时，不计算 Replay Reproducibility', () => {
    const missingCase = buildReplayObservations(firstRun, secondRun.slice(1));
    const duplicateCase = buildReplayObservations(firstRun, [
      ...secondRun.slice(1),
      { ...secondRun[0], id: secondRun[1].id },
    ]);
    const reorderedCases = buildReplayObservations(firstRun, [...secondRun].reverse());

    expect(missingCase).toBeNull();
    expect(duplicateCase).toBeNull();
    expect(reorderedCases?.every((result) => result.reproducible)).toBe(true);
    expect(computeMetrics(firstRun, missingCase).replayReproducibility).toBeNull();
  });

  it('输出机器可读 JSON 与人类可读 Markdown 报告', async () => {
    const replay = buildReplayObservations(firstRun, secondRun);
    const report = buildReport(cases, firstRun, replay);
    const { jsonPath, markdownPath } = await writeReports(report);
    expect(jsonPath).toContain('deterministic.json');
    expect(markdownPath).toContain('deterministic.md');
    expect(report.reportVersion).toBe(1);
    expect(report.coverage).toMatchObject({
      totalCases: 20,
      selectedCases: 20,
      executedCases: 20,
      passedCases: 20,
      coverageRate: 1,
      qualityPassRate: 1,
    });
    const runtimeProfile = DEPLOYMENT_RUNTIME_PROFILE_REGISTRY.resolveSystem('default');
    expect(report.environment.runtimeCompatibility).toEqual({
      componentPresetId: runtimeProfile.componentPresetId,
      componentPresetVersion: runtimeProfile.componentPresetVersion,
      rendererVersion: runtimeProfile.rendererVersion,
    });
    expect(report.cases.filter((result) => result.category === 'patch')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionProfile: expect.objectContaining({
            replayInstructionVersion: FIXTURE_REPLAY_INSTRUCTION_VERSION,
            policyProfile: 'simple_patch',
          }),
        }),
      ]),
    );
    expect(report.cases).toHaveLength(20);
    expect(report.cases.every((result) => result.telemetry !== undefined)).toBe(true);
    expect(
      report.cases
        .filter((result) => result.category !== 'patch')
        .every((result) => result.telemetry.usage === null && result.telemetry.toolCalls === null),
    ).toBe(true);
  });

  it('确定性门禁：Expected Outcome Rate 与 Replay Reproducibility 均为 100%', () => {
    const replay = buildReplayObservations(firstRun, secondRun);
    const metrics = computeMetrics(firstRun, replay);
    expect(metrics.expectedOutcomeRate).toBe(1);
    expect(metrics.replayReproducibility).toBe(1);
    expect(firstRun.every((result) => result.status === 'passed')).toBe(true);
  });
});
