import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  verifyFixture,
  validateEvidenceManifest,
  parseTestReport,
  verifyTestResults,
} from '../check-m1a-capabilities.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

function loadValidManifest() {
  const manifestPath = resolve(repoRoot, 'test-fixtures/m1a-capability-evidence.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function createDummyPassedReport(manifest) {
  const seen = new Set();
  const report = [];
  for (const e of manifest.evidences) {
    const key = `${e.testFile}:::${e.fullName}`;
    if (!seen.has(key)) {
      seen.add(key);
      report.push({
        testFile: e.testFile,
        fullName: e.fullName,
        status: 'passed',
      });
    }
  }
  return report;
}

test('check-m1a-capabilities: positive baseline passes validation with dummy report', () => {
  const manifest = loadValidManifest();
  const fixtureRes = verifyFixture(manifest, repoRoot);
  assert.equal(fixtureRes.verified, true);

  const manifestRes = validateEvidenceManifest(manifest, repoRoot);
  assert.equal(manifestRes.valid, true);

  const dummyReport = createDummyPassedReport(manifest);
  const verifyRes = verifyTestResults(manifest, dummyReport, repoRoot);
  assert.equal(verifyRes.allPassed, true);
  assert.equal(verifyRes.verifiedCount, manifest.evidences.length);
});

test('check-m1a-capabilities: 1. 缺消费面 (missing surface in matrix)', () => {
  const manifest = loadValidManifest();
  delete manifest.matrix['page-state']['storage'];
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /Matrix capability "page-state" surfaces count mismatch|missing required consumer surface/,
  );
});

test('check-m1a-capabilities: 2. 未知面 (unknown surface in matrix)', () => {
  const manifest = loadValidManifest();
  manifest.matrix['page-state']['unknown-surface'] = 'ev-contract-page-state';
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /Matrix capability "page-state" surfaces count mismatch/,
  );
});

test('check-m1a-capabilities: 3. 未知能力 (unknown capability in matrix)', () => {
  const manifest = loadValidManifest();
  manifest.matrix['unknown-cap'] = { ...manifest.matrix['page-state'] };
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /Matrix capabilities count mismatch/,
  );
});

test('check-m1a-capabilities: 4. 重复证据 ID (duplicate evidence ID)', () => {
  const manifest = loadValidManifest();
  const duplicate = { ...manifest.evidences[0] };
  manifest.evidences.push(duplicate);
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /Duplicate evidence id found/,
  );
});

test('check-m1a-capabilities: 5. 无效引用 (matrix cell references non-existent evidence ID)', () => {
  const manifest = loadValidManifest();
  manifest.matrix['page-state']['contract'] = 'ev-nonexistent-id';
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /references nonexistent evidence id "ev-nonexistent-id"/,
  );
});

test('check-m1a-capabilities: 6. 缺文件 (evidence testFile does not exist)', () => {
  const manifest = loadValidManifest();
  manifest.evidences[0].testFile = 'packages/schema-contract/src/__tests__/non-existent-test-file.ts';
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /testFile does not exist/,
  );
});

test('check-m1a-capabilities: 7. 越界路径 (testFile is absolute or escapes repo)', () => {
  const manifestAbsolute = loadValidManifest();
  manifestAbsolute.evidences[0].testFile = '/tmp/pwned.ts';
  assert.throws(
    () => validateEvidenceManifest(manifestAbsolute, repoRoot),
    /testFile must be repo-relative/,
  );

  const manifestEscapes = loadValidManifest();
  manifestEscapes.evidences[0].testFile = '../../outside-repo.ts';
  assert.throws(
    () => validateEvidenceManifest(manifestEscapes, repoRoot),
    /testFile escapes repository/,
  );
});

test('check-m1a-capabilities: 8. 缺 case (evidence missing from test report)', () => {
  const manifest = loadValidManifest();
  const dummyReport = createDummyPassedReport(manifest);
  // 移除第一个用例
  dummyReport.shift();
  assert.throws(
    () => verifyTestResults(manifest, dummyReport, repoRoot),
    /Evidence missing from test reports/,
  );
});

test('check-m1a-capabilities: 9. skipped / todo case (test status is skipped or todo)', () => {
  const manifest = loadValidManifest();
  const dummyReportSkipped = createDummyPassedReport(manifest);
  dummyReportSkipped[0].status = 'skipped';
  assert.throws(
    () => verifyTestResults(manifest, dummyReportSkipped, repoRoot),
    /Evidence test not passed[\s\S]*"skipped"/,
  );

  const dummyReportTodo = createDummyPassedReport(manifest);
  dummyReportTodo[0].status = 'todo';
  assert.throws(
    () => verifyTestResults(manifest, dummyReportTodo, repoRoot),
    /Evidence test not passed[\s\S]*"todo"/,
  );
});

test('check-m1a-capabilities: 10. failed case (test status is failed)', () => {
  const manifest = loadValidManifest();
  const dummyReportFailed = createDummyPassedReport(manifest);
  dummyReportFailed[0].status = 'failed';
  assert.throws(
    () => verifyTestResults(manifest, dummyReportFailed, repoRoot),
    /Evidence test not passed[\s\S]*"failed"/,
  );
});

test('check-m1a-capabilities: 11. 空报告 (empty report with no testResults)', () => {
  assert.throws(
    () => parseTestReport(JSON.stringify({}), repoRoot),
    /Invalid test report: missing "testResults"/,
  );
});

test('check-m1a-capabilities: 12. malformed 报告 (invalid JSON string)', () => {
  assert.throws(
    () => parseTestReport('{ invalid json ...', repoRoot),
    /Malformed JSON test report/,
  );
});

test('check-m1a-capabilities: 13. 摘要/版本不符 (fixture digest or version mismatch)', () => {
  const manifestShaMismatch = loadValidManifest();
  manifestShaMismatch.fixture.sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  assert.throws(
    () => verifyFixture(manifestShaMismatch, repoRoot),
    /Fixture SHA-256 mismatch/,
  );

  const manifestVersionMismatch = loadValidManifest();
  manifestVersionMismatch.fixture.corpusVersion = '9.9.9';
  assert.throws(
    () => verifyFixture(manifestVersionMismatch, repoRoot),
    /Fixture corpusVersion mismatch/,
  );
});

test('check-m1a-capabilities: 14. 缺 Editor 或 Agent (missing editor or agent keyGroups)', () => {
  const manifestMissingEditor = loadValidManifest();
  delete manifestMissingEditor.keyGroups.editor;
  assert.throws(
    () => validateEvidenceManifest(manifestMissingEditor, repoRoot),
    /Manifest keyGroups missing required group: "editor"/,
  );

  const manifestMissingAgent = loadValidManifest();
  manifestMissingAgent.keyGroups.agent = [];
  assert.throws(
    () => validateEvidenceManifest(manifestMissingAgent, repoRoot),
    /keyGroups.agent must be a non-empty array/,
  );
});

test('check-m1a-capabilities: 15. 缺 P10 子 case (missing P10 budget sub-case)', () => {
  const manifest = loadValidManifest();
  delete manifest.keyGroups.parity.P10_durationBudget;
  assert.throws(
    () => validateEvidenceManifest(manifest, repoRoot),
    /keyGroups.parity missing required parity sub-case: "P10_durationBudget"/,
  );
});

test('check-m1a-capabilities: 16. CLI 在异常时非零退出 (CLI exits non-zero on failure)', () => {
  // 在一个不存在的 cwd 中运行 CLI
  const proc = spawnSync('node', [resolve(__dirname, '../check-m1a-capabilities.mjs')], {
    cwd: resolve(__dirname, '../../packages'), // 这里没有 test-fixtures 目录
    encoding: 'utf8',
  });

  assert.notEqual(proc.status, 0, 'CLI should exit non-zero when manifest is not found');
  assert.match(proc.stderr, /Evidence manifest not found|FAILED/, 'CLI should print failure message');
});
