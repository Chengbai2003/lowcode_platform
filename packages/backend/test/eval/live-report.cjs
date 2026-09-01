function roundRate(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function summarizeLiveResults(results) {
  const executed = results.filter((result) => !result.skipped);
  return {
    totalCases: results.length,
    executedCases: executed.length,
    skippedCases: results.length - executed.length,
    coverageRate: roundRate(executed.length, results.length),
    firstPassSuccessRate: roundRate(
      executed.filter((result) => result.firstPassSuccess).length,
      executed.length,
    ),
    averageLatencyMs: executed.length
      ? Math.round(executed.reduce((sum, result) => sum + result.latencyMs, 0) / executed.length)
      : null,
  };
}

module.exports = { summarizeLiveResults };
