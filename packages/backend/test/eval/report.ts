/**
 * Agent Eval — 报告输出（机器可读 JSON + 人类可读 Markdown）
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvalCaseCategory } from './eval-case.types';
import type { EvalRunReport } from './report-contract';

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

function statusLabel(status: EvalRunReport['cases'][number]['status']): string {
  switch (status) {
    case 'passed':
      return '✅ passed';
    case 'failed':
      return '❌ failed';
    case 'unsupported':
      return '⏭️ unsupported';
    case 'infra_error':
      return '⚠️ infra_error';
    case 'not_selected':
      return '⏸️ not_selected';
  }
}

function runtimeLabel(
  runtimeCompatibility: EvalRunReport['environment']['runtimeCompatibility'],
): string {
  if (!runtimeCompatibility) return 'unavailable (runtime metadata was not discovered)';
  return `${runtimeCompatibility.componentPresetId}@${runtimeCompatibility.componentPresetVersion} / renderer@${runtimeCompatibility.rendererVersion}`;
}

export function renderMarkdown(report: EvalRunReport): string {
  const lines: string[] = [];
  lines.push(
    `# Agent ${report.run.mode === 'deterministic' ? 'Deterministic' : 'Live'} Eval Report`,
  );
  lines.push('');
  lines.push(`- Report: v${report.reportVersion}`);
  lines.push(`- Run: \`${report.run.runId}\` (${report.run.mode})`);
  lines.push(`- Revision: \`${report.run.revision}\` (${report.run.revisionSource})`);
  lines.push(`- Generated at: ${report.run.generatedAt}`);
  lines.push(
    `- Provider / Model: ${report.run.provider ?? 'n/a'} / ${report.run.model ?? 'n/a'} (${report.run.modelSelectionSource})`,
  );
  lines.push(
    `- Contract: package v${report.environment.contract.packageVersion} (${report.environment.contract.packageVersionSource}) / PageSchema v${report.environment.contract.pageSchemaVersion} / Eval Case v${report.environment.contract.evalCaseSchemaVersion}`,
  );
  lines.push(`- Runtime: ${runtimeLabel(report.environment.runtimeCompatibility)}`);
  lines.push(
    `- Source versions: prompt=${report.environment.sourceVersions.prompt}, tool=${report.environment.sourceVersions.tool}, manifest=${report.environment.sourceVersions.manifest} (${report.environment.sourceVersions.source})`,
  );
  lines.push(`- Canonical results digest: \`${report.resultsDigest}\``);
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('| --- | --- |');
  lines.push(
    `| Total / Selected / Executed | ${report.coverage.totalCases} / ${report.coverage.selectedCases} / ${report.coverage.executedCases} |`,
  );
  lines.push(
    `| Passed / Failed | ${report.coverage.passedCases} / ${report.coverage.failedCases} |`,
  );
  lines.push(
    `| Unsupported / Infra Error / Not Selected | ${report.coverage.unsupportedCases} / ${report.coverage.infraErrorCases} / ${report.coverage.notSelectedCases} |`,
  );
  lines.push(`| Coverage Rate | ${pct(report.coverage.coverageRate)} |`);
  lines.push(`| Quality Pass Rate | ${pct(report.coverage.qualityPassRate)} |`);
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
  lines.push('| 类别 | 用例 | 状态 | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  for (const result of report.cases) {
    const label = CATEGORY_LABELS[result.category];
    const detail =
      result.mismatchCount === undefined
        ? result.status
        : `${result.mismatchCount} field mismatch(es)`;
    lines.push(
      `| ${label} | ${result.id} | ${statusLabel(result.status)} | ${detail.replace(/\|/g, '\\|')} |`,
    );
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
