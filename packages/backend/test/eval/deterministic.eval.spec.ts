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
import { runEvalCase, serializeResult } from './pipeline';
import { computeMetrics } from './metrics';
import { writeReports } from './report';
import { validateEvalCase } from './case-contract';
import {
  BASELINE_CASE_QUOTAS,
  EVAL_CASE_SCHEMA_VERSION,
  EVAL_HARNESS_VERSION,
  type EvalCase,
  type EvalCaseResult,
  type EvalRunReport,
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
    results.push(await runEvalCase(kase));
  }
  return results;
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
    const first = firstRun.map(serializeResult);
    const second = secondRun.map(serializeResult);
    expect(second).toEqual(first);
  });

  it('输出机器可读 JSON 与人类可读 Markdown 报告', async () => {
    const replay = firstRun.map((r, index) => ({
      id: r.id,
      reproducible: serializeResult(r) === serializeResult(secondRun[index]),
    }));
    const report: EvalRunReport = {
      harnessVersion: EVAL_HARNESS_VERSION,
      caseSchemaVersion: EVAL_CASE_SCHEMA_VERSION,
      contractPackageVersion: contractPackageVersion(),
      revision: revision(),
      generatedAt: new Date().toISOString(),
      totalCases: cases.length,
      metrics: computeMetrics(cases, firstRun, replay),
      cases: firstRun,
    };
    const { jsonPath, markdownPath } = await writeReports(report);
    expect(jsonPath).toContain('deterministic.json');
    expect(markdownPath).toContain('deterministic.md');
  });

  it('确定性门禁：Expected Outcome Rate 与 Replay Reproducibility 均为 100%', () => {
    const replay = firstRun.map((r, index) => ({
      id: r.id,
      reproducible: serializeResult(r) === serializeResult(secondRun[index]),
    }));
    const metrics = computeMetrics(cases, firstRun, replay);
    expect(metrics.expectedOutcomeRate).toBe(1);
    expect(metrics.replayReproducibility).toBe(1);
  });
});
