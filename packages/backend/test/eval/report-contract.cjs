const { createHash } = require('node:crypto');

const EVAL_REPORT_VERSION = 1;
const EVAL_CASE_CATEGORIES = new Set(['draft', 'patch', 'validation', 'conflict', 'safety']);
const EVAL_CASE_STATUSES = new Set([
  'passed',
  'failed',
  'unsupported',
  'infra_error',
  'not_selected',
]);
const PATCH_RUN_PROFILES = new Set([
  'fast_path',
  'simple_patch',
  'normal_patch',
  'complex_patch',
  'batch_patch',
]);
const REVISION_SOURCES = new Set(['local_checkout', 'target_declaration']);
const MODEL_SELECTION_SOURCES = new Set(['fixture', 'requested', 'observed']);
const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):([0-5]\d)(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

function object(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function string(value, field) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

function nullableString(value, field) {
  return value === null ? null : nonEmptyString(value, field);
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function nonNegativeIntegerOrNull(value, field) {
  if (value === null) return null;
  return nonNegativeInteger(value, field);
}

function nonNegativeNumberOrNull(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number or null`);
  }
  return value;
}

function rate(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a number between 0 and 1`);
  }
  return value;
}

function rateOrNull(value, field) {
  return value === null ? null : rate(value, field);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidRfc3339DateTime(value) {
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? null : Number(match[7]);
  const offsetMinute = match[8] === undefined ? null : Number(match[8]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (offsetHour === null || (offsetHour <= 23 && offsetMinute <= 59))
  );
}

function dateTime(value, field) {
  const parsed = nonEmptyString(value, field);
  if (!isValidRfc3339DateTime(parsed)) {
    throw new Error(`${field} must be a valid RFC3339 date-time`);
  }
  return parsed;
}

function roundRate(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortDeep(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(sortDeep(value));
}

function summarizeCoverage(cases) {
  const counts = {
    totalCases: cases.length,
    selectedCases: 0,
    executedCases: 0,
    passedCases: 0,
    failedCases: 0,
    unsupportedCases: 0,
    infraErrorCases: 0,
    notSelectedCases: 0,
  };

  for (const result of cases) {
    switch (result.status) {
      case 'passed':
        counts.selectedCases += 1;
        counts.executedCases += 1;
        counts.passedCases += 1;
        break;
      case 'failed':
        counts.selectedCases += 1;
        counts.executedCases += 1;
        counts.failedCases += 1;
        break;
      case 'unsupported':
        counts.selectedCases += 1;
        counts.unsupportedCases += 1;
        break;
      case 'infra_error':
        counts.selectedCases += 1;
        counts.infraErrorCases += 1;
        break;
      case 'not_selected':
        counts.notSelectedCases += 1;
        break;
      default:
        throw new Error(`Unknown Eval case status: ${String(result.status)}`);
    }
  }

  return {
    ...counts,
    coverageRate: roundRate(counts.executedCases, counts.selectedCases),
    qualityPassRate: roundRate(counts.passedCases, counts.executedCases),
  };
}

function canonicalCase(result) {
  return {
    id: result.id,
    category: result.category,
    title: result.title,
    status: result.status,
    ...(result.mismatchCount === undefined ? {} : { mismatchCount: result.mismatchCount }),
    ...(result.executionProfile === undefined ? {} : { executionProfile: result.executionProfile }),
  };
}

function publicExecutionProfile(profile) {
  const raw = object(profile, 'executionProfile');
  const policyProfile = nonEmptyString(raw.policyProfile, 'executionProfile.policyProfile');
  if (!PATCH_RUN_PROFILES.has(policyProfile)) {
    throw new Error(`Unknown AgentPatchRunProfile: ${policyProfile}`);
  }
  return {
    replayInstructionVersion: nonEmptyString(
      raw.replayInstructionVersion,
      'executionProfile.replayInstructionVersion',
    ),
    policyProfile,
  };
}

function publicTelemetry(telemetry) {
  const raw = object(telemetry, 'telemetry');
  const usage = publicUsage(raw.usage);
  return {
    latencyMs: nonNegativeIntegerOrNull(raw.latencyMs, 'telemetry.latencyMs'),
    usage,
    cost: nonNegativeNumberOrNull(raw.cost, 'telemetry.cost'),
    toolCalls: publicToolCalls(raw.toolCalls),
    repairCount: nonNegativeIntegerOrNull(raw.repairCount, 'telemetry.repairCount'),
  };
}

function publicToolCalls(toolCalls) {
  if (toolCalls === null) return null;
  const observedToolCalls = toObservedToolCalls(toolCalls);
  if (observedToolCalls === null) {
    throw new Error('telemetry.toolCalls must be a complete array or null');
  }
  return observedToolCalls;
}

/**
 * Returns only a complete, observable tool-call trace. `[]` means a real trace
 * with no calls; `null` means the trace was absent or malformed and therefore
 * must not be reported as zero calls.
 */
function toObservedToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return null;
  if (
    !toolCalls.every(
      (call) =>
        call !== null &&
        typeof call === 'object' &&
        typeof call.toolName === 'string' &&
        call.toolName.length > 0 &&
        typeof call.success === 'boolean',
    )
  ) {
    return null;
  }
  return toolCalls.map((call) => ({ toolName: call.toolName, success: call.success }));
}

function unavailableTelemetry() {
  return {
    latencyMs: null,
    usage: null,
    cost: null,
    toolCalls: null,
    repairCount: null,
  };
}

function publicUsage(usage) {
  if (usage === null) return null;
  const rawUsage = object(usage, 'telemetry.usage');
  return {
    promptTokens: nonNegativeInteger(rawUsage.promptTokens, 'telemetry.usage.promptTokens'),
    completionTokens: nonNegativeInteger(
      rawUsage.completionTokens,
      'telemetry.usage.completionTokens',
    ),
    totalTokens: nonNegativeInteger(rawUsage.totalTokens, 'telemetry.usage.totalTokens'),
  };
}

function publicCase(result) {
  const raw = object(result, 'case');
  const category = nonEmptyString(raw.category, 'case.category');
  const status = nonEmptyString(raw.status, 'case.status');
  if (!EVAL_CASE_CATEGORIES.has(category))
    throw new Error(`Unknown Eval case category: ${category}`);
  if (!EVAL_CASE_STATUSES.has(status)) throw new Error(`Unknown Eval case status: ${status}`);
  if (raw.mismatches !== undefined && !Array.isArray(raw.mismatches))
    throw new Error('case.mismatches must be an array');
  const mismatchCount =
    raw.mismatchCount === undefined
      ? raw.mismatches?.length
      : nonNegativeInteger(raw.mismatchCount, 'case.mismatchCount');
  return {
    id: nonEmptyString(raw.id, 'case.id'),
    category,
    title: string(raw.title, 'case.title'),
    status,
    ...(mismatchCount === undefined ? {} : { mismatchCount }),
    ...(raw.executionProfile === undefined
      ? {}
      : { executionProfile: publicExecutionProfile(raw.executionProfile) }),
    telemetry:
      raw.telemetry === undefined ? unavailableTelemetry() : publicTelemetry(raw.telemetry),
  };
}

function publicRun(run) {
  const raw = object(run, 'run');
  const mode = nonEmptyString(raw.mode, 'run.mode');
  if (mode !== 'deterministic' && mode !== 'live')
    throw new Error(`Unknown Eval run mode: ${mode}`);
  const revisionSource = nonEmptyString(raw.revisionSource, 'run.revisionSource');
  if (!REVISION_SOURCES.has(revisionSource)) {
    throw new Error(`Unknown Eval revision source: ${revisionSource}`);
  }
  const modelSelectionSource = nonEmptyString(raw.modelSelectionSource, 'run.modelSelectionSource');
  if (!MODEL_SELECTION_SOURCES.has(modelSelectionSource)) {
    throw new Error(`Unknown Eval model selection source: ${modelSelectionSource}`);
  }
  return {
    runId: nonEmptyString(raw.runId, 'run.runId'),
    mode,
    generatedAt: dateTime(raw.generatedAt, 'run.generatedAt'),
    revision: nonEmptyString(raw.revision, 'run.revision'),
    revisionSource,
    provider: nullableString(raw.provider, 'run.provider'),
    model: nullableString(raw.model, 'run.model'),
    modelSelectionSource,
  };
}

function publicRuntimeCompatibility(runtimeCompatibility) {
  if (runtimeCompatibility === null) return null;
  const raw = object(runtimeCompatibility, 'environment.runtimeCompatibility');
  return {
    componentPresetId: nonEmptyString(
      raw.componentPresetId,
      'environment.runtimeCompatibility.componentPresetId',
    ),
    componentPresetVersion: nonEmptyString(
      raw.componentPresetVersion,
      'environment.runtimeCompatibility.componentPresetVersion',
    ),
    rendererVersion: nonEmptyString(
      raw.rendererVersion,
      'environment.runtimeCompatibility.rendererVersion',
    ),
  };
}

function publicEnvironment(environment) {
  const raw = object(environment, 'environment');
  const contract = object(raw.contract, 'environment.contract');
  const sourceVersions = object(raw.sourceVersions, 'environment.sourceVersions');
  const pageSchemaVersion = nonNegativeIntegerOrNull(
    contract.pageSchemaVersion,
    'environment.contract.pageSchemaVersion',
  );
  if (!Number.isSafeInteger(contract.evalCaseSchemaVersion) || contract.evalCaseSchemaVersion < 1) {
    throw new Error('environment.contract.evalCaseSchemaVersion must be a positive integer');
  }
  const packageVersionSource = nonEmptyString(
    contract.packageVersionSource,
    'environment.contract.packageVersionSource',
  );
  if (!REVISION_SOURCES.has(packageVersionSource)) {
    throw new Error(`Unknown Eval package version source: ${packageVersionSource}`);
  }
  const sourceVersionSource = nonEmptyString(
    sourceVersions.source,
    'environment.sourceVersions.source',
  );
  if (!REVISION_SOURCES.has(sourceVersionSource)) {
    throw new Error(`Unknown Eval source version source: ${sourceVersionSource}`);
  }
  return {
    contract: {
      packageVersion: nonEmptyString(
        contract.packageVersion,
        'environment.contract.packageVersion',
      ),
      packageVersionSource,
      pageSchemaVersion,
      evalCaseSchemaVersion: contract.evalCaseSchemaVersion,
    },
    runtimeCompatibility: publicRuntimeCompatibility(raw.runtimeCompatibility),
    sourceVersions: {
      prompt: nonEmptyString(sourceVersions.prompt, 'environment.sourceVersions.prompt'),
      tool: nonEmptyString(sourceVersions.tool, 'environment.sourceVersions.tool'),
      manifest: nonEmptyString(sourceVersions.manifest, 'environment.sourceVersions.manifest'),
      source: sourceVersionSource,
    },
  };
}

function publicMetrics(metrics, qualityPassRate) {
  const raw = object(metrics, 'metrics');
  const expectedOutcomeRate = rateOrNull(raw.expectedOutcomeRate, 'metrics.expectedOutcomeRate');
  if (expectedOutcomeRate !== qualityPassRate) {
    throw new Error('metrics.expectedOutcomeRate must equal the case-derived qualityPassRate');
  }
  return {
    expectedOutcomeRate,
    schemaValidRate: rateOrNull(raw.schemaValidRate, 'metrics.schemaValidRate'),
    patchMinimality: nonNegativeNumberOrNull(raw.patchMinimality, 'metrics.patchMinimality'),
    safetyBlockRate: rateOrNull(raw.safetyBlockRate, 'metrics.safetyBlockRate'),
    versionConflictIntegrity: rateOrNull(
      raw.versionConflictIntegrity,
      'metrics.versionConflictIntegrity',
    ),
    replayReproducibility: rateOrNull(raw.replayReproducibility, 'metrics.replayReproducibility'),
    qualityPassRate: rateOrNull(qualityPassRate, 'metrics.qualityPassRate'),
  };
}

function assertSourceConsistency(run, environment) {
  const expectedVersionSource =
    run.mode === 'deterministic' ? 'local_checkout' : 'target_declaration';
  if (run.revisionSource !== expectedVersionSource) {
    throw new Error(`run.revisionSource must be ${expectedVersionSource} for ${run.mode}`);
  }
  if (environment.contract.packageVersionSource !== expectedVersionSource) {
    throw new Error(
      `environment.contract.packageVersionSource must be ${expectedVersionSource} for ${run.mode}`,
    );
  }
  if (environment.sourceVersions.source !== expectedVersionSource) {
    throw new Error(
      `environment.sourceVersions.source must be ${expectedVersionSource} for ${run.mode}`,
    );
  }
  if (run.mode === 'deterministic' && run.modelSelectionSource !== 'fixture') {
    throw new Error('run.modelSelectionSource must be fixture for deterministic');
  }
  if (run.mode === 'live' && run.modelSelectionSource === 'fixture') {
    throw new Error('run.modelSelectionSource cannot be fixture for live');
  }
  if (run.mode === 'live' && (run.provider === null || run.model === null)) {
    throw new Error('run.provider and run.model must be recorded for live');
  }
}

function assertRuntimeMetadataAvailability(run, environment, cases) {
  const runtimeUnavailable = environment.runtimeCompatibility === null;
  const pageSchemaVersionUnavailable = environment.contract.pageSchemaVersion === null;
  if (runtimeUnavailable !== pageSchemaVersionUnavailable) {
    throw new Error(
      'environment.runtimeCompatibility and environment.contract.pageSchemaVersion must be unavailable together',
    );
  }
  if (!runtimeUnavailable) return;
  if (run.mode !== 'live') {
    throw new Error('runtime metadata can be unavailable only for live runs');
  }
  if (!cases.some((evalCase) => evalCase.status === 'infra_error')) {
    throw new Error('runtime metadata can be unavailable only when a live run has an infra_error');
  }
  if (cases.some((evalCase) => evalCase.status === 'passed' || evalCase.status === 'failed')) {
    throw new Error('runtime metadata can be unavailable when a live run has executed Cases');
  }
}

function canonicalResults(report) {
  return {
    reportVersion: report.reportVersion,
    environment: report.environment,
    coverage: report.coverage,
    metrics: report.metrics,
    cases: report.cases
      .map(canonicalCase)
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  };
}

function assertUniqueCaseIds(cases) {
  const ids = new Set();
  for (const evalCase of cases) {
    if (ids.has(evalCase.id)) {
      throw new Error(`Duplicate Eval case id: ${evalCase.id}`);
    }
    ids.add(evalCase.id);
  }
}

function resultsDigest(report) {
  return createHash('sha256')
    .update(stableJson(canonicalResults(report)))
    .digest('hex');
}

function createEvalRunReport(input) {
  // Eval runner 可携带 matchesExpected 等内部断言字段；Report v1 只发布 Schema
  // 明确定义的字段，避免产物与 JSON Schema 静默漂移。
  const cases = input.cases.map(publicCase);
  assertUniqueCaseIds(cases);
  const coverage = summarizeCoverage(cases);
  const run = publicRun(input.run);
  const environment = publicEnvironment(input.environment);
  assertSourceConsistency(run, environment);
  assertRuntimeMetadataAvailability(run, environment, cases);
  const report = {
    reportVersion: EVAL_REPORT_VERSION,
    run,
    environment,
    coverage,
    metrics: publicMetrics(input.metrics, coverage.qualityPassRate),
    cases,
  };
  return { ...report, resultsDigest: resultsDigest(report) };
}

module.exports = {
  EVAL_REPORT_VERSION,
  canonicalResults,
  createEvalRunReport,
  resultsDigest,
  stableJson,
  summarizeCoverage,
  toObservedToolCalls,
};
