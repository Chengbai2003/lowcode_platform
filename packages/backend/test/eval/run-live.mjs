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

const results = [];
for (const evalCase of cases) {
  const startedAt = Date.now();
  let ok = false;
  let route = null;
  let error = null;
  try {
    const response = await fetch(`${BASE_URL}/agent/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        prompt: evalCase.intent,
        pageId: 'eval-live-page',
        responseMode: evalCase.category === 'draft' ? 'schema' : 'patch',
      }),
    });
    ok = response.ok;
    if (response.ok) {
      const body = await response.json();
      route = body?.route ?? body?.routeDecision?.route ?? null;
    } else {
      error = `HTTP ${response.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  results.push({
    id: evalCase.id,
    category: evalCase.category,
    ok,
    route,
    error,
    latencyMs: Date.now() - startedAt,
  });
  console.log(`[eval:live] ${evalCase.id}: ${ok ? 'ok' : `failed (${error})`} ${results.at(-1).latencyMs}ms`);
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  contractPackageVersion: JSON.parse(
    readFileSync(join(process.cwd(), '../schema-contract/package.json'), 'utf-8'),
  ).version,
  firstPassSuccessRate:
    results.length === 0
      ? null
      : Math.round((results.filter((r) => r.ok).length / results.length) * 10_000) / 10_000,
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
    `- First-pass Success Rate: ${report.firstPassSuccessRate ?? 'n/a'}`,
    '',
    '| 用例 | 结果 | 延迟(ms) | 路由 |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (r) => `| ${r.id} | ${r.ok ? '✅' : `❌ ${r.error ?? ''}`} | ${r.latencyMs} | ${r.route ?? '-'} |`,
    ),
    '',
  ].join('\n'),
);
console.log(`[eval:live] 报告已写入 ${OUT_DIR}`);
