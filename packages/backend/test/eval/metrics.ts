/**
 * Agent Eval — 指标计算（Issue #18 / M0-3）
 *
 * - Schema Valid Rate：产出 schemaValid 实际结果的用例中，实际合法的比例
 * - Expected Outcome Rate：全部用例 expected 与 actual 一致的比例
 * - Patch Minimality：patch 类用例 normalizedOps/submittedOps 的均值
 * - Safety Block Rate：safety 类用例中实际被拦截的比例
 * - Version Conflict Integrity：conflict 类用例一致的比例
 * - Replay Reproducibility：两次独立运行结果逐键一致的比例
 */

import type { EvalCase, EvalCaseResult } from './eval-case.types';

export interface EvalMetrics {
  expectedOutcomeRate: number;
  schemaValidRate: number | null;
  patchMinimality: number | null;
  safetyBlockRate: number | null;
  versionConflictIntegrity: number | null;
  replayReproducibility: number;
}

function rate(matched: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((matched / total) * 10_000) / 10_000;
}

export function computeMetrics(
  cases: EvalCase[],
  results: EvalCaseResult[],
  replay: Array<{ id: string; reproducible: boolean }>,
): EvalMetrics {
  const byId = new Map(results.map((r) => [r.id, r]));

  const expectedOutcomeRate =
    rate(results.filter((r) => r.matchesExpected).length, results.length) ?? 0;

  const schemaResults = results.filter((result) => typeof result.actual.schemaValid === 'boolean');
  const schemaValidRate = rate(
    schemaResults.filter((result) => result.actual.schemaValid === true).length,
    schemaResults.length,
  );

  const patchCases = cases.filter((c) => c.category === 'patch');
  const patchMinimality =
    patchCases.length === 0
      ? null
      : Math.round(
          (patchCases.reduce((sum, c) => {
            const r = byId.get(c.id);
            const submitted = Number(r?.actual.submittedOps ?? 0);
            const normalized = Number(r?.actual.normalizedOps ?? 0);
            return sum + (submitted === 0 ? 1 : normalized / submitted);
          }, 0) /
            patchCases.length) *
            10_000,
        ) / 10_000;

  const safetyResults = results.filter((result) => result.category === 'safety');
  const safetyBlockRate = rate(
    safetyResults.filter((result) => result.actual.blocked === true).length,
    safetyResults.length,
  );

  const conflictCases = cases.filter((c) => c.category === 'conflict');
  const conflictMatched = conflictCases.filter((c) => byId.get(c.id)?.matchesExpected).length;
  const versionConflictIntegrity = rate(conflictMatched, conflictCases.length);

  const replayReproducibility =
    rate(replay.filter((r) => r.reproducible).length, replay.length) ?? 0;

  return {
    expectedOutcomeRate,
    schemaValidRate,
    patchMinimality,
    safetyBlockRate,
    versionConflictIntegrity,
    replayReproducibility,
  };
}
