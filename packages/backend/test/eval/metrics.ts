/**
 * Agent Eval — 指标计算（Issue #18 / M0-3）
 *
 * - Schema Valid Rate：声明了 schemaValid 期望的用例中实际一致的比例
 * - Expected Outcome Rate：全部用例 expected 与 actual 一致的比例
 * - Patch Minimality：patch 类用例 normalizedOps/submittedOps 的均值
 * - Safety Block Rate：safety 类用例按期望拦截的比例
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
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const expectedOutcomeRate =
    rate(results.filter((r) => r.matchesExpected).length, results.length) ?? 0;

  const schemaRelevant = cases.filter((c) => 'schemaValid' in c.expected);
  const schemaMatched = schemaRelevant.filter((c) => byId.get(c.id)?.matchesExpected).length;
  const schemaValidRate = rate(schemaMatched, schemaRelevant.length);

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

  const safetyCases = cases.filter((c) => c.category === 'safety');
  const safetyMatched = safetyCases.filter((c) => byId.get(c.id)?.matchesExpected).length;
  const safetyBlockRate = rate(safetyMatched, safetyCases.length);

  const conflictCases = cases.filter((c) => c.category === 'conflict');
  const conflictMatched = conflictCases.filter((c) => byId.get(c.id)?.matchesExpected).length;
  const versionConflictIntegrity = rate(conflictMatched, conflictCases.length);

  const replayReproducibility =
    rate(replay.filter((r) => r.reproducible).length, replay.length) ?? 0;

  void caseById;
  return {
    expectedOutcomeRate,
    schemaValidRate,
    patchMinimality,
    safetyBlockRate,
    versionConflictIntegrity,
    replayReproducibility,
  };
}
