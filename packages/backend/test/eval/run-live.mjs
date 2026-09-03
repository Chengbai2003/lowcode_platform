#!/usr/bin/env node
/**
 * Agent Live Eval（Issue #38 / A2）
 *
 * 真实模型趋势评测：不进 CI，只写 Report v1。A3 才负责声明用例 mode、
 * 全覆盖执行、多次采样与 P50/P95。
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import liveReport from './live-report.cjs';

const BASE_URL = process.env.AGENT_EVAL_BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = process.env.AGENT_EVAL_TOKEN || '';
const CASES_DIR = join(process.cwd(), 'test/eval/cases');
const OUT_DIR = process.env.AGENT_EVAL_ARTIFACT_DIR || '.codex/artifacts/agent-eval/live';

if (!TOKEN) {
  console.error(
    '[eval:live] 缺少 AGENT_EVAL_TOKEN（后端 API_SECRET）。live 通道需要真实模型凭据，' +
      '不属于确定性门禁；CI 不会运行本脚本。',
  );
  process.exit(1);
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[eval:live] 缺少 ${name}。Live 不能从本地 checkout 推断目标部署的版本或模型身份。`,
    );
  }
  return value;
}

// 目标服务目前不暴露完整 provenance endpoint；因此版本与模型选择必须由发起
// Live run 的部署配置显式声明。严禁读取本地 checkout 作为远端运行事实。
const targetMetadata = {
  revision: requiredEnvironmentValue('AGENT_EVAL_TARGET_REVISION'),
  contractPackageVersion: requiredEnvironmentValue('AGENT_EVAL_CONTRACT_PACKAGE_VERSION'),
  promptVersion: requiredEnvironmentValue('AGENT_EVAL_PROMPT_VERSION'),
  toolVersion: requiredEnvironmentValue('AGENT_EVAL_TOOL_VERSION'),
  manifestVersion: requiredEnvironmentValue('AGENT_EVAL_MANIFEST_VERSION'),
  provider: requiredEnvironmentValue('AGENT_EVAL_PROVIDER'),
  model: requiredEnvironmentValue('AGENT_EVAL_MODEL_ID'),
};

const cases = readdirSync(CASES_DIR)
  .filter((file) => file.endsWith('.case.json'))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(CASES_DIR, file), 'utf-8')));
const evalCaseSchemaVersion = cases[0]?.caseSchemaVersion;
if (
  !Number.isInteger(evalCaseSchemaVersion) ||
  cases.some((evalCase) => evalCase.caseSchemaVersion !== evalCaseSchemaVersion)
) {
  throw new Error('[eval:live] cases must share one integer caseSchemaVersion');
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};
const defaultSchema = {
  schemaVersion: 0,
  rootId: 'root',
  components: { root: { id: 'root', type: 'Page', childrenIds: [] } },
};
const unwrap = (body) => body?.data ?? body;

function httpError(stage, response, body) {
  const code = body?.code ?? body?.error?.code;
  return `${stage} HTTP ${response.status}${typeof code === 'string' ? ` (${code})` : ''}`;
}

function sameRuntimeCompatibility(left, right) {
  return (
    left.componentPresetId === right.componentPresetId &&
    left.componentPresetVersion === right.componentPresetVersion &&
    left.rendererVersion === right.rendererVersion
  );
}

function isRuntimeCompatibility(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.componentPresetId === 'string' &&
    value.componentPresetId.length > 0 &&
    typeof value.componentPresetVersion === 'string' &&
    value.componentPresetVersion.length > 0 &&
    typeof value.rendererVersion === 'string' &&
    value.rendererVersion.length > 0
  );
}

function isPageSchemaVersion(value) {
  return Number.isInteger(value) && value >= 0;
}

function isInfrastructureHttpStatus(status) {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function runtimeLabel(runtimeCompatibility) {
  if (!runtimeCompatibility) return 'unavailable (infrastructure error before runtime discovery)';
  return `${runtimeCompatibility.componentPresetId}@${runtimeCompatibility.componentPresetVersion} / renderer@${runtimeCompatibility.rendererVersion}`;
}

function responseMode(category) {
  return category === 'draft' || category === 'validation' || category === 'safety'
    ? 'schema'
    : 'patch';
}

function liveStrategy(evalCase) {
  const invalidSchema = evalCase.fixtures?.schema ?? evalCase.fixtures?.modelOutputSchema;
  if (evalCase.category === 'conflict') {
    return {
      supported: false,
      reason: 'Repository CAS fixtures are not representable by agent/edit; deferred to A3',
    };
  }
  if (evalCase.category === 'safety' && !invalidSchema)
    return { supported: false, reason: 'expression fixtures are not representable by agent/edit' };
  if (evalCase.category === 'validation' && !invalidSchema)
    return {
      supported: false,
      reason: 'recorded patch fixtures are not injectable through agent/edit',
    };
  return {
    supported: true,
    mode: responseMode(evalCase.category),
    draftSchema: ['validation', 'safety'].includes(evalCase.category) ? invalidSchema : undefined,
    expectsRejection:
      Boolean(evalCase.expected?.blocked) && ['validation', 'safety'].includes(evalCase.category),
  };
}

async function getPage(pageId) {
  const response = await fetch(`${BASE_URL}/pages/${encodeURIComponent(pageId)}/schema`, {
    headers,
  });
  const body = unwrap(await response.json().catch(() => null));
  if (!response.ok) throw new Error(httpError('page read', response, body));
  return body;
}

async function createPage(pageId, schema) {
  const response = await fetch(`${BASE_URL}/pages/${encodeURIComponent(pageId)}/schema`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ schema }),
  });
  const body = unwrap(await response.json().catch(() => null));
  if (!response.ok) throw new Error(httpError('page setup', response, body));
  const savedVersion = body?.pageVersion ?? body?.page?.currentPageVersion ?? null;
  if (!Number.isSafeInteger(savedVersion) || savedVersion <= 0) {
    throw new Error('page setup did not return a positive integer pageVersion');
  }
  const page = await getPage(pageId);
  return {
    pageVersion: savedVersion,
    runtimeCompatibility: page?.runtimeCompatibility ?? null,
    pageSchemaVersion: page?.schema?.schemaVersion ?? null,
  };
}

async function getTrace(traceId) {
  if (typeof traceId !== 'string' || traceId.length === 0) {
    throw new Error('agent edit response did not contain a traceId');
  }
  const response = await fetch(`${BASE_URL}/agent/traces/${encodeURIComponent(traceId)}`, {
    headers,
  });
  const body = unwrap(await response.json().catch(() => null));
  if (!response.ok) throw new Error(httpError('trace read', response, body));
  if (body === null || typeof body !== 'object') {
    throw new Error('trace read returned an invalid response body');
  }
  return body;
}

function completedRequestedMode(data, trace, mode) {
  return trace?.success === true && data?.mode === mode && !data?.requiresConfirmation;
}

const results = [];
let runtimeCompatibility = null;
let pageSchemaVersion = null;

for (const evalCase of cases) {
  const startedAt = Date.now();
  let error = null;
  let infraError = false;
  const pageId = `eval-live-${Date.now().toString(36)}-${evalCase.id}`;
  const strategy = liveStrategy(evalCase);
  if (!strategy.supported) {
    results.push({
      id: evalCase.id,
      category: evalCase.category,
      title: evalCase.title,
      status: 'unsupported',
      skipped: true,
      skipReason: strategy.reason,
    });
    continue;
  }

  const mode = strategy.mode;
  let pageVersion = null;
  let data = null;
  let trace = null;
  let responseRejected = false;
  const requestBody = {
    instruction: evalCase.intent,
    pageId,
    responseMode: mode,
    ...(mode === 'schema'
      ? {
          draftSchema:
            strategy.draftSchema ??
            evalCase.fixtures?.modelOutputSchema ??
            evalCase.fixtures?.baseSchema ??
            defaultSchema,
        }
      : {}),
    provider: targetMetadata.provider,
    modelId: targetMetadata.model,
  };

  try {
    const initialPage = await createPage(pageId, evalCase.fixtures?.baseSchema ?? defaultSchema);
    pageVersion = initialPage.pageVersion;
    if (
      !isRuntimeCompatibility(initialPage.runtimeCompatibility) ||
      !isPageSchemaVersion(initialPage.pageSchemaVersion)
    ) {
      throw new Error('page setup did not return runtimeCompatibility and schemaVersion');
    }
    if (
      runtimeCompatibility &&
      !sameRuntimeCompatibility(runtimeCompatibility, initialPage.runtimeCompatibility)
    ) {
      throw new Error(
        'page setup returned a runtime compatibility tuple inconsistent with this run',
      );
    }
    if (pageSchemaVersion !== null && pageSchemaVersion !== initialPage.pageSchemaVersion) {
      throw new Error('page setup returned a schemaVersion inconsistent with this run');
    }
    runtimeCompatibility ??= initialPage.runtimeCompatibility;
    pageSchemaVersion ??= initialPage.pageSchemaVersion;
    requestBody.pageVersion = pageVersion;
    const response = await fetch(`${BASE_URL}/agent/edit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    data = unwrap(await response.json().catch(() => null));
    if (!response.ok) {
      responseRejected = true;
      error = httpError('agent edit', response, data);
      infraError = isInfrastructureHttpStatus(response.status);
      if (typeof data?.traceId === 'string' && data.traceId.length > 0) {
        try {
          trace = await getTrace(data.traceId);
        } catch (caught) {
          const traceError = caught instanceof Error ? caught.message : String(caught);
          error = `${error}; ${traceError}`;
          infraError = true;
        }
      }
    } else {
      trace = await getTrace(data?.traceId);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    infraError = true;
  }

  const latencyMs = Date.now() - startedAt;
  const errorCode = data?.code ?? data?.error?.code ?? null;
  const completed = !error && completedRequestedMode(data, trace, mode);
  const rejectedAsExpected =
    responseRejected && (errorCode === 'SCHEMA_INVALID' || errorCode === 'AGENT_POLICY_BLOCKED');
  if (strategy.expectsRejection && (!rejectedAsExpected || trace?.success !== false)) {
    infraError = true;
  }
  const firstPassSuccess = strategy.expectsRejection
    ? rejectedAsExpected && trace?.success === false
    : completed;
  const status = infraError ? 'infra_error' : firstPassSuccess ? 'passed' : 'failed';

  results.push({
    id: evalCase.id,
    category: evalCase.category,
    title: evalCase.title,
    status,
    pageId,
    pageVersion,
    responseMode: mode,
    firstPassSuccess,
    route: data?.route ?? null,
    traceId: data?.traceId ?? null,
    usage: data?.usage ?? null,
    cost: data?.cost ?? data?.usage?.cost ?? null,
    repairCount: data?.repairCount ?? null,
    toolCalls: trace?.toolCalls ?? null,
    error,
    latencyMs,
  });

  console.log(
    `[eval:live] ${evalCase.id}: ${status === 'passed' ? 'ok' : `${status} (${error ?? 'not completed'})`} ${latencyMs}ms`,
  );
}

const summary = liveReport.summarizeLiveResults(results);
const report = liveReport.buildLiveReport({
  run: {
    runId: `live-${Date.now().toString(36)}`,
    mode: 'live',
    generatedAt: new Date().toISOString(),
    revision: targetMetadata.revision,
    revisionSource: 'target_declaration',
    provider: targetMetadata.provider,
    model: targetMetadata.model,
    modelSelectionSource: 'requested',
  },
  environment: {
    contract: {
      packageVersion: targetMetadata.contractPackageVersion,
      packageVersionSource: 'target_declaration',
      pageSchemaVersion,
      evalCaseSchemaVersion,
    },
    runtimeCompatibility,
    sourceVersions: {
      prompt: targetMetadata.promptVersion,
      tool: targetMetadata.toolVersion,
      manifest: targetMetadata.manifestVersion,
      source: 'target_declaration',
    },
  },
  results,
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'live.json'), JSON.stringify(report, null, 2));
writeFileSync(
  join(OUT_DIR, 'live.md'),
  [
    '# Agent Live Eval Report',
    '',
    `- Report: v${report.reportVersion}`,
    `- Run: \`${report.run.runId}\``,
    `- Revision: \`${report.run.revision}\` (${report.run.revisionSource})`,
    `- Provider / Model: ${report.run.provider} / ${report.run.model} ` +
      `(${report.run.modelSelectionSource})`,
    `- Runtime: ${runtimeLabel(report.environment.runtimeCompatibility)}`,
    `- Cases: ${report.coverage.totalCases} total / ${report.coverage.executedCases} executed / ${report.coverage.unsupportedCases} unsupported / ${report.coverage.infraErrorCases} infra error`,
    `- Coverage Rate: ${report.coverage.coverageRate ?? 'n/a'}`,
    `- First-pass Success Rate: ${summary.firstPassSuccessRate ?? 'n/a'}`,
    `- Average Latency: ${summary.averageLatencyMs ?? 'n/a'}ms`,
    `- Canonical results digest: \`${report.resultsDigest}\``,
    '',
    '| 用例 | 状态 | 延迟(ms) | Tool calls |',
    '| --- | --- | --- | --- |',
    ...report.cases.map(
      (result) =>
        `| ${result.id} | ${result.status} | ${result.telemetry?.latencyMs ?? '-'} | ${result.telemetry?.toolCalls?.length ?? '-'} |`,
    ),
    '',
  ].join('\n'),
);
console.log(`[eval:live] Report v${report.reportVersion} 已写入 ${OUT_DIR}`);
