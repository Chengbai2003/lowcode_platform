const {
  createEvalRunReport,
  summarizeCoverage,
  toObservedToolCalls,
} = require('./report-contract.cjs');

function toCaseStatus(result) {
  if (result.status) return result.status;
  if (result.skipped) return 'unsupported';
  if (result.infraError) return 'infra_error';
  return result.firstPassSuccess ? 'passed' : 'failed';
}

function toTelemetry(result) {
  return {
    latencyMs:
      Number.isSafeInteger(result.latencyMs) && result.latencyMs >= 0 ? result.latencyMs : null,
    usage:
      result.usage &&
      Number.isSafeInteger(result.usage.promptTokens) &&
      result.usage.promptTokens >= 0 &&
      Number.isSafeInteger(result.usage.completionTokens) &&
      result.usage.completionTokens >= 0 &&
      Number.isSafeInteger(result.usage.totalTokens) &&
      result.usage.totalTokens >= 0
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : null,
    cost: Number.isFinite(result.cost) && result.cost >= 0 ? result.cost : null,
    // Trace 中可能含 input/output 摘要；报告只保留完整的工具名和成功状态。
    // 任何缺失或损坏的记录都不能降格为“明确的零次调用”。
    toolCalls: toObservedToolCalls(result.toolCalls),
    repairCount:
      Number.isSafeInteger(result.repairCount) && result.repairCount >= 0
        ? result.repairCount
        : null,
  };
}

function toEvalReportCase(result) {
  const mismatchCount = Array.isArray(result.mismatches) ? result.mismatches.length : undefined;
  return {
    id: result.id,
    category: result.category,
    title: result.title ?? '',
    status: toCaseStatus(result),
    ...(mismatchCount === undefined ? {} : { mismatchCount }),
    telemetry: toTelemetry(result),
  };
}

function summarizeLiveResults(results) {
  const cases = results.map(toEvalReportCase);
  const coverage = summarizeCoverage(cases);
  const executed = results.filter((result) => {
    const status = toCaseStatus(result);
    return status === 'passed' || status === 'failed';
  });
  return {
    totalCases: coverage.totalCases,
    executedCases: coverage.executedCases,
    skippedCases: coverage.unsupportedCases + coverage.notSelectedCases,
    infraErrorCases: coverage.infraErrorCases,
    coverageRate: coverage.coverageRate,
    firstPassSuccessRate: coverage.qualityPassRate,
    averageLatencyMs: executed.length
      ? Math.round(
          executed.reduce((sum, result) => sum + (Number(result.latencyMs) || 0), 0) /
            executed.length,
        )
      : null,
  };
}

function buildLiveReport(input) {
  const cases = input.results.map(toEvalReportCase);
  const coverage = summarizeCoverage(cases);
  return createEvalRunReport({
    run: input.run,
    environment: input.environment,
    metrics: {
      expectedOutcomeRate: coverage.qualityPassRate,
      schemaValidRate: null,
      patchMinimality: null,
      safetyBlockRate: null,
      versionConflictIntegrity: null,
      // Live 当前只采样一次；A3 的多次采样完成前不能把未测误报成 0%。
      replayReproducibility: null,
    },
    cases,
  });
}

module.exports = { buildLiveReport, summarizeLiveResults, toEvalReportCase };
