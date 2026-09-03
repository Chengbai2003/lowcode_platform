/**
 * Agent Eval — 指标计算（Issue #18 / M0-3）
 *
 * - Schema Valid Rate：产出 schemaValid 实际结果的用例中，实际合法的比例
 * - Expected Outcome Rate：可比较用例 expected 与 actual 一致的比例
 * - Patch Minimality：patch 类用例 normalizedOps/submittedOps 的均值
 * - Safety Block Rate：safety 类用例中实际被拦截的比例
 * - Version Conflict Integrity：conflict 类用例一致的比例
 * - Replay Reproducibility：两次独立运行结果逐键一致的比例
 */

import type { EvalCaseResult } from './eval-case.types';

export interface EvalMetrics {
  expectedOutcomeRate: number | null;
  schemaValidRate: number | null;
  patchMinimality: number | null;
  safetyBlockRate: number | null;
  versionConflictIntegrity: number | null;
  replayReproducibility: number | null;
}

export interface EvalReplayObservation {
  id: string;
  reproducible: boolean;
}

/** `null` 表示两次运行的 Case ID 无法一一对应，不能计算可复现性。 */
export type EvalReplayObservations = ReadonlyArray<EvalReplayObservation> | null;

function rate(matched: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((matched / total) * 10_000) / 10_000;
}

function isComparableResult(result: EvalCaseResult): boolean {
  return result.status === 'passed' || result.status === 'failed';
}

function operationCounts(result: EvalCaseResult): { submitted: number; normalized: number } | null {
  const submitted = result.actual.submittedOps;
  const normalized = result.actual.normalizedOps;
  if (
    typeof submitted !== 'number' ||
    !Number.isFinite(submitted) ||
    submitted < 0 ||
    typeof normalized !== 'number' ||
    !Number.isFinite(normalized) ||
    normalized < 0
  ) {
    return null;
  }
  return { submitted, normalized };
}

function computeReplayReproducibility(
  results: readonly EvalCaseResult[],
  comparableResults: readonly EvalCaseResult[],
  replay: EvalReplayObservations,
): number | null {
  if (replay === null) return null;
  const allResultIds = new Set(results.map((result) => result.id));
  if (allResultIds.size !== results.length) return null;

  const comparableIds = new Set(comparableResults.map((result) => result.id));
  const replayById = new Map<string, boolean>();
  for (const entry of replay) {
    if (!allResultIds.has(entry.id) || replayById.has(entry.id)) return null;
    replayById.set(entry.id, entry.reproducible);
  }
  if (!comparableResults.every((result) => replayById.has(result.id))) return null;

  return rate(
    [...comparableIds].filter((id) => replayById.get(id) === true).length,
    comparableResults.length,
  );
}

export function computeMetrics(
  results: EvalCaseResult[],
  replay: EvalReplayObservations,
): EvalMetrics {
  // 基础设施故障与未选择用例不属于可比较的质量样本；它们由 Report coverage 单独呈现。
  const comparableResults = results.filter(isComparableResult);
  const expectedOutcomeRate = rate(
    comparableResults.filter((result) => result.matchesExpected).length,
    comparableResults.length,
  );

  const schemaResults = comparableResults.filter(
    (result) => typeof result.actual.schemaValid === 'boolean',
  );
  const schemaValidRate = rate(
    schemaResults.filter((result) => result.actual.schemaValid === true).length,
    schemaResults.length,
  );

  const patchCounts = comparableResults
    .filter((result) => result.category === 'patch')
    .map(operationCounts)
    .filter((counts): counts is { submitted: number; normalized: number } => counts !== null);
  const patchMinimality =
    patchCounts.length === 0
      ? null
      : Math.round(
          (patchCounts.reduce(
            (sum, { submitted, normalized }) =>
              sum + (submitted === 0 ? 1 : normalized / submitted),
            0,
          ) /
            patchCounts.length) *
            10_000,
        ) / 10_000;

  const safetyResults = comparableResults.filter((result) => result.category === 'safety');
  const safetyBlockRate = rate(
    safetyResults.filter((result) => result.actual.blocked === true).length,
    safetyResults.length,
  );

  const conflictResults = comparableResults.filter((result) => result.category === 'conflict');
  const versionConflictIntegrity = rate(
    conflictResults.filter((result) => result.matchesExpected).length,
    conflictResults.length,
  );

  const replayReproducibility = computeReplayReproducibility(results, comparableResults, replay);

  return {
    expectedOutcomeRate,
    schemaValidRate,
    patchMinimality,
    safetyBlockRate,
    versionConflictIntegrity,
    replayReproducibility,
  };
}
