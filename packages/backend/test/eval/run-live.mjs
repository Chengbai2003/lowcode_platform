#!/usr/bin/env node
/**
 * Agent Live Eval（Issue #18 / M0-3 Scope B）
 *
 * 真实模型趋势评测：对**本地运行中的后端**发起与 deterministic 基线
 * 相同情录的 agent 请求，记录延迟、路由结果与 Patch 规模，产出趋势
 * 报告。仅用于手动/定时观测——不进入 CI，绝不以 Token/延迟/总分阻断 PR。
 *
 * 用法：
 *   1. 启动后端（pnpm dev:backend），并配置真实的 AI Provider 凭据；
 *   2. AGENT_EVAL_BASE_URL=http://localhost:3000/api/v1 \
 *      AGENT_EVAL_TOKEN=<API_SECRET> pnpm eval:live
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

const cases = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.case.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), 'utf-8')));

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

function responseMode(category) {
  return category === 'draft' || category === 'validation' || category === 'safety'
    ? 'schema'
    : 'patch';
}

function liveStrategy(evalCase) {
  const invalidSchema = evalCase.fixtures?.schema ?? evalCase.fixtures?.modelOutputSchema;
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
    staleVersion: evalCase.category === 'conflict',
  };
}

async function createPage(pageId, schema, basePageVersion) {
  const response = await fetch(`${BASE_URL}/pages/${encodeURIComponent(pageId)}/schema`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ schema, ...(basePageVersion ? { basePageVersion } : {}) }),
  });
  const body = unwrap(await response.json().catch(() => null));
  if (!response.ok) throw new Error(`page setup HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body?.pageVersion ?? body?.page?.currentPageVersion ?? null;
}

async function getTrace(traceId) {
  if (!traceId) return null;
  const response = await fetch(`${BASE_URL}/agent/traces/${encodeURIComponent(traceId)}`, {
    headers,
  });
  return response.ok ? unwrap(await response.json().catch(() => null)) : null;
}

const results = [];
for (const evalCase of cases) {
  const startedAt = Date.now();
  let error = null;

  const pageId = `eval-live-${Date.now().toString(36)}-${evalCase.id}`;
  const strategy = liveStrategy(evalCase);
  if (!strategy.supported) {
    results.push({
      id: evalCase.id,
      category: evalCase.category,
      skipped: true,
      skipReason: strategy.reason,
    });
    continue;
  }
  const mode = strategy.mode;
  let pageVersion = null;
  let data = null;
  let trace = null;
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
    ...(process.env.AGENT_EVAL_PROVIDER ? { provider: process.env.AGENT_EVAL_PROVIDER } : {}),
    ...(process.env.AGENT_EVAL_MODEL_ID ? { modelId: process.env.AGENT_EVAL_MODEL_ID } : {}),
  };

  try {
    pageVersion = await createPage(pageId, evalCase.fixtures?.baseSchema ?? defaultSchema);
    if (strategy.staleVersion)
      await createPage(pageId, evalCase.fixtures?.baseSchema ?? defaultSchema, pageVersion);
    requestBody.pageVersion = pageVersion;
    const response = await fetch(`${BASE_URL}/agent/edit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    data = unwrap(await response.json().catch(() => null));
    if (!response.ok) error = `HTTP ${response.status}: ${JSON.stringify(data)}`;
    trace = await getTrace(data?.traceId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const latencyMs = Date.now() - startedAt;
  const errorCode = data?.code ?? data?.error?.code ?? null;
  const firstPassSuccess = strategy.expectsRejection
    ? Boolean(error && (errorCode === 'SCHEMA_INVALID' || errorCode === 'AGENT_POLICY_BLOCKED'))
    : strategy.staleVersion
      ? Boolean(error && errorCode === 'PAGE_VERSION_CONFLICT')
      : !error && trace?.success === true && data?.mode === mode && !data?.requiresConfirmation;
  results.push({
    id: evalCase.id,
    category: evalCase.category,
    pageId,
    pageVersion,
    responseMode: mode,
    skipped: false,
    firstPassSuccess,
    route: data?.route ?? null,
    traceId: data?.traceId ?? null,
    model: data?.model ?? data?.modelConfig?.modelName ?? process.env.AGENT_EVAL_MODEL_ID ?? null,
    provider: data?.provider ?? process.env.AGENT_EVAL_PROVIDER ?? null,
    usage: data?.usage ?? null,
    cost: data?.cost ?? data?.usage?.cost ?? null,
    repairCount: data?.retryCount ?? null,
    toolCalls: trace?.toolCalls ?? [],
    versions: {
      prompt: process.env.AGENT_EVAL_PROMPT_VERSION ?? null,
      tool: process.env.AGENT_EVAL_TOOL_VERSION ?? null,
      manifest: process.env.AGENT_EVAL_MANIFEST_VERSION ?? null,
    },
    error,
    latencyMs,
  });

  console.log(
    `[eval:live] ${evalCase.id}: ${firstPassSuccess ? 'ok' : `failed (${error ?? 'not completed'})`} ${latencyMs}ms`,
  );
}

const summary = liveReport.summarizeLiveResults(results);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  contractPackageVersion: JSON.parse(
    readFileSync(join(process.cwd(), '../schema-contract/package.json'), 'utf-8'),
  ).version,
  ...summary,
  results,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'live.json'), JSON.stringify(report, null, 2));
writeFileSync(
  join(OUT_DIR, 'live.md'),
  [
    '# Agent Live Eval Trend',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Cases: ${report.totalCases} total / ${report.executedCases} executed / ${report.skippedCases} skipped`,
    `- Coverage Rate: ${report.coverageRate ?? 'n/a'}`,
    `- First-pass Success Rate: ${report.firstPassSuccessRate ?? 'n/a'}`,
    `- Average Latency: ${report.averageLatencyMs ?? 'n/a'}ms`,
    '',
    '| 用例 | 首轮完成 | 延迟(ms) | 路由 | Tool calls | Trace ID |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.skipped ? `⏭️ ${r.skipReason}` : r.firstPassSuccess ? '✅' : `❌ ${r.error ?? ''}`} | ${r.latencyMs ?? '-'} | ${r.route ?? '-'} | ${r.toolCalls?.length ?? '-'} | ${r.traceId ?? '-'} |`,
    ),
    '',
  ].join('\n'),
);
console.log(`[eval:live] 报告已写入 ${OUT_DIR}`);
