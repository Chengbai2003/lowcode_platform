/**
 * Agent Eval — 报告输出（机器可读 JSON + 人类可读 Markdown）
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvalCaseCategory, EvalRunReport } from './eval-case.types';

// 默认写入仓库根的 .codex/artifacts（与 compiler:regression 产物一致）
export const EVAL_ARTIFACT_DIR =
  process.env.AGENT_EVAL_ARTIFACT_DIR ||
  join(__dirname, '../../../..', '.codex/artifacts/agent-eval');

const CATEGORY_LABELS: Record<EvalCaseCategory, string> = {
  draft: '冷启动页面起草',
  patch: '局部最小 Patch',
  validation: '非法 Schema/Patch 校验与修复',
  conflict: 'pageVersion/Session 冲突',
  safety: '安全场景',
};

export async function writeReports(
  report: EvalRunReport,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(EVAL_ARTIFACT_DIR, { recursive: true });
  const jsonPath = join(EVAL_ARTIFACT_DIR, 'deterministic.json');
  const markdownPath = join(EVAL_ARTIFACT_DIR, 'deterministic.md');
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  await writeFile(markdownPath, renderMarkdown(report), 'utf-8');
  return { jsonPath, markdownPath };
}

function pct(value: number | null): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(2)}%`;
}

export function renderMarkdown(report: EvalRunReport): string {
  const lines: string[] = [];
  lines.push('# Agent Deterministic Eval Report');
  lines.push('');
  lines.push(`- Revision: \`${report.revision}\``);
  lines.push(`- Contract package: v${report.contractPackageVersion}`);
  lines.push(
    `- Eval harness: v${report.harnessVersion}（case schema v${report.caseSchemaVersion}）`,
  );
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Cases: ${report.totalCases}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| Expected Outcome Rate | ${pct(report.metrics.expectedOutcomeRate)} |`);
  lines.push(`| Schema Valid Rate | ${pct(report.metrics.schemaValidRate)} |`);
  lines.push(`| Patch Minimality | ${report.metrics.patchMinimality ?? 'n/a'} |`);
  lines.push(`| Safety Block Rate | ${pct(report.metrics.safetyBlockRate)} |`);
  lines.push(`| Version Conflict Integrity | ${pct(report.metrics.versionConflictIntegrity)} |`);
  lines.push(`| Replay Reproducibility | ${pct(report.metrics.replayReproducibility)} |`);
  lines.push('');
  lines.push('## Cases');
  lines.push('');
  lines.push('| 类别 | 用例 | 结果 | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  for (const result of report.cases) {
    const label = CATEGORY_LABELS[result.category];
    const status = result.matchesExpected ? '✅' : '❌';
    const detail = result.matchesExpected
      ? JSON.stringify(result.actual)
      : result.mismatches.join('; ');
    lines.push(`| ${label} | ${result.id} | ${status} | ${detail.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** 供脚本化调用：写报告并返回 JSON 路径 */
export async function writeReportTo(report: EvalRunReport, outputDir: string): Promise<string> {
  await mkdir(dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'deterministic.json');
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  await writeFile(join(outputDir, 'deterministic.md'), renderMarkdown(report), 'utf-8');
  return jsonPath;
}
