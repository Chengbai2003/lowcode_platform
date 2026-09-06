#!/usr/bin/env node
/**
 * M1a-3 / C3b: Capability Gates & CI Evidence Verifier
 *
 * Requirements (Issue #47 / C3b Plan Section 5):
 * 1. Verifies fixture sha256 and corpusVersion without modification.
 * 2. Validates evidence manifest structure: 3 capabilities × 6 surfaces = 18 cells,
 *    key groups (editor, agent, ingressRejections, storage, profileRejections, parity P1–P10).
 * 3. Executes targeted narrow test suites into an isolated temporary directory.
 * 4. Verifies exact fullName matching with status="passed" across all cited evidences.
 * 5. Pure Node stdlib (zero new dependencies).
 *
 * Usage: node scripts/check-m1a-capabilities.mjs
 */

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, relative, isAbsolute, normalize, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export const REQUIRED_CAPABILITIES = Object.freeze(['page-state', 'named-computed', 'action-flow']);

export const REQUIRED_SURFACES = Object.freeze([
  'contract',
  'validator',
  'editor-agent',
  'renderer',
  'compiler',
  'storage',
]);

export const REQUIRED_KEY_GROUPS = Object.freeze([
  'editor',
  'agent',
  'ingressRejections',
  'storage',
  'profileRejections',
  'parity',
]);

export const REQUIRED_INGRESS_REJECTIONS = Object.freeze([
  'pageSchemaServiceSave',
  'repositoryDirectSave',
  'repositoryDiskReload',
  'agentDraft',
  'agentPatchResult',
  'editorJsonSave',
  'rendererMount',
  'compilerServiceCompile',
  'compilerDirectCompile',
]);

export const REQUIRED_PARITY_KEYS = Object.freeze([
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  'P10_actionBudget',
  'P10_iterationBudget',
  'P10_depthBudget',
  'P10_durationBudget',
  'P10_concurrencyBudget',
]);

/**
 * 校验统一定型 Fixture 的原始字节 SHA-256 和版本号
 */
export function verifyFixture(manifest, repoRoot) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest object');
  }
  if (!manifest.fixture || typeof manifest.fixture !== 'object') {
    throw new Error('Manifest missing "fixture" object');
  }
  const { path: fixtureRelPath, corpusVersion, sha256 } = manifest.fixture;
  if (!fixtureRelPath || typeof fixtureRelPath !== 'string') {
    throw new Error('Manifest fixture path must be a non-empty string');
  }

  const fullPath = resolve(repoRoot, fixtureRelPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Fixture file not found at ${fullPath}`);
  }

  const rawBytes = readFileSync(fullPath);
  const actualSha256 = createHash('sha256').update(rawBytes).digest('hex');
  if (actualSha256 !== sha256) {
    throw new Error(
      `Fixture SHA-256 mismatch: expected ${sha256}, got ${actualSha256}. Fixture modification is prohibited in C3b.`,
    );
  }

  const parsed = JSON.parse(rawBytes.toString('utf8'));
  if (parsed.corpusVersion !== corpusVersion) {
    throw new Error(
      `Fixture corpusVersion mismatch: expected ${corpusVersion}, got ${parsed.corpusVersion}`,
    );
  }

  return { verified: true, actualSha256, corpusVersion };
}

/**
 * 校验证据清单结构、3×6 矩阵完整性、关键证据分组及用例元数据合法性
 */
export function validateEvidenceManifest(manifest, repoRoot) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Evidence manifest must be a JSON object');
  }

  if (manifest.evidenceFormatVersion !== 1) {
    throw new Error(`Unsupported evidenceFormatVersion: ${manifest.evidenceFormatVersion}`);
  }

  // 1. 矩阵结构校验：必须正好 3 能力 × 6 消费面
  if (!manifest.matrix || typeof manifest.matrix !== 'object') {
    throw new Error('Manifest missing "matrix" mapping');
  }
  const manifestCaps = Object.keys(manifest.matrix);
  if (manifestCaps.length !== REQUIRED_CAPABILITIES.length) {
    throw new Error(
      `Matrix capabilities count mismatch: expected exactly ${REQUIRED_CAPABILITIES.length}, got ${manifestCaps.length}`,
    );
  }
  for (const cap of REQUIRED_CAPABILITIES) {
    if (!manifest.matrix[cap] || typeof manifest.matrix[cap] !== 'object') {
      throw new Error(`Matrix missing required capability: "${cap}"`);
    }
    const surfaces = Object.keys(manifest.matrix[cap]);
    if (surfaces.length !== REQUIRED_SURFACES.length) {
      throw new Error(
        `Matrix capability "${cap}" surfaces count mismatch: expected exactly ${REQUIRED_SURFACES.length}, got ${surfaces.length}`,
      );
    }
    for (const surface of REQUIRED_SURFACES) {
      if (typeof manifest.matrix[cap][surface] !== 'string') {
        throw new Error(
          `Matrix cell [${cap}][${surface}] must be an evidence ID string, got ${typeof manifest.matrix[cap][surface]}`,
        );
      }
    }
  }

  // 2. 关键分组校验
  if (!manifest.keyGroups || typeof manifest.keyGroups !== 'object') {
    throw new Error('Manifest missing "keyGroups" object');
  }
  for (const group of REQUIRED_KEY_GROUPS) {
    if (!manifest.keyGroups[group]) {
      throw new Error(`Manifest keyGroups missing required group: "${group}"`);
    }
  }

  // 检查 editor 与 agent 均为非空数组
  if (!Array.isArray(manifest.keyGroups.editor) || manifest.keyGroups.editor.length === 0) {
    throw new Error('keyGroups.editor must be a non-empty array of evidence IDs');
  }
  if (!Array.isArray(manifest.keyGroups.agent) || manifest.keyGroups.agent.length === 0) {
    throw new Error('keyGroups.agent must be a non-empty array of evidence IDs');
  }

  // 检查 ingressRejections 涵盖 9 个真实入口
  const ingressObj = manifest.keyGroups.ingressRejections;
  if (!ingressObj || typeof ingressObj !== 'object') {
    throw new Error('keyGroups.ingressRejections must be an object mapping 9 ingress points');
  }
  for (const ingressKey of REQUIRED_INGRESS_REJECTIONS) {
    if (!ingressObj[ingressKey] || typeof ingressObj[ingressKey] !== 'string') {
      throw new Error(`keyGroups.ingressRejections missing required ingress point: "${ingressKey}"`);
    }
  }

  // 检查 storage 包含证据 ID
  if (!Array.isArray(manifest.keyGroups.storage) || manifest.keyGroups.storage.length === 0) {
    throw new Error('keyGroups.storage must be a non-empty array of evidence IDs');
  }

  // 检查 profileRejections 包含证据 ID
  if (
    !Array.isArray(manifest.keyGroups.profileRejections) ||
    manifest.keyGroups.profileRejections.length === 0
  ) {
    throw new Error('keyGroups.profileRejections must be a non-empty array of evidence IDs');
  }

  // 检查 parity 包含 P1..P9 及 P10 五个预算 case
  const parityObj = manifest.keyGroups.parity;
  if (!parityObj || typeof parityObj !== 'object') {
    throw new Error('keyGroups.parity must be an object mapping P1 through P10 sub-cases');
  }
  for (const pKey of REQUIRED_PARITY_KEYS) {
    if (!parityObj[pKey] || typeof parityObj[pKey] !== 'string') {
      throw new Error(`keyGroups.parity missing required parity sub-case: "${pKey}"`);
    }
  }

  // 3. 证据列表与引用解析
  if (!Array.isArray(manifest.evidences) || manifest.evidences.length === 0) {
    throw new Error('Manifest "evidences" must be a non-empty array');
  }

  const evidenceMap = new Map();
  for (const evidence of manifest.evidences) {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('Each evidence entry must be an object');
    }
    const { id, package: pkg, runner, testFile, fullName } = evidence;
    if (!id || typeof id !== 'string') {
      throw new Error('Evidence entry missing id string');
    }
    if (evidenceMap.has(id)) {
      throw new Error(`Duplicate evidence id found: "${id}"`);
    }
    if (!pkg || typeof pkg !== 'string') {
      throw new Error(`Evidence "${id}" missing "package" string`);
    }
    if (runner !== 'vitest' && runner !== 'jest') {
      throw new Error(`Evidence "${id}" runner must be "vitest" or "jest", got "${runner}"`);
    }
    if (!testFile || typeof testFile !== 'string') {
      throw new Error(`Evidence "${id}" missing "testFile" string`);
    }
    if (isAbsolute(testFile)) {
      throw new Error(`Evidence "${id}" testFile must be repo-relative, got absolute path "${testFile}"`);
    }
    const normalizedPath = normalize(testFile);
    if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
      throw new Error(`Evidence "${id}" testFile escapes repository: "${testFile}"`);
    }
    const resolvedPath = resolve(repoRoot, testFile);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Evidence "${id}" testFile does not exist: "${testFile}"`);
    }
    if (!fullName || typeof fullName !== 'string') {
      throw new Error(`Evidence "${id}" missing fullName string`);
    }

    evidenceMap.set(id, evidence);
  }

  // 4. 确保矩阵中的每个引用都能解析
  for (const cap of REQUIRED_CAPABILITIES) {
    for (const surface of REQUIRED_SURFACES) {
      const refId = manifest.matrix[cap][surface];
      if (!evidenceMap.has(refId)) {
        throw new Error(
          `Matrix cell [${cap}][${surface}] references nonexistent evidence id "${refId}"`,
        );
      }
    }
  }

  // 5. 确保 keyGroups 中的所有引用都能解析
  for (const editorId of manifest.keyGroups.editor) {
    if (!evidenceMap.has(editorId)) {
      throw new Error(`keyGroups.editor references nonexistent evidence id "${editorId}"`);
    }
  }
  for (const agentId of manifest.keyGroups.agent) {
    if (!evidenceMap.has(agentId)) {
      throw new Error(`keyGroups.agent references nonexistent evidence id "${agentId}"`);
    }
  }
  for (const [k, ingressId] of Object.entries(manifest.keyGroups.ingressRejections)) {
    if (!evidenceMap.has(ingressId)) {
      throw new Error(
        `keyGroups.ingressRejections.${k} references nonexistent evidence id "${ingressId}"`,
      );
    }
  }
  for (const storageId of manifest.keyGroups.storage) {
    if (!evidenceMap.has(storageId)) {
      throw new Error(`keyGroups.storage references nonexistent evidence id "${storageId}"`);
    }
  }
  for (const profId of manifest.keyGroups.profileRejections) {
    if (!evidenceMap.has(profId)) {
      throw new Error(`keyGroups.profileRejections references nonexistent evidence id "${profId}"`);
    }
  }
  for (const [k, parityId] of Object.entries(manifest.keyGroups.parity)) {
    if (!evidenceMap.has(parityId)) {
      throw new Error(`keyGroups.parity.${k} references nonexistent evidence id "${parityId}"`);
    }
  }

  return { valid: true, evidenceCount: evidenceMap.size };
}

/**
 * 解析单个 Jest / Vitest JSON 报告并规范化其中的用例结果
 */
export function parseTestReport(rawJson, repoRoot) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Malformed JSON test report: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.testResults)) {
    throw new Error('Invalid test report: missing "testResults" array');
  }

  const results = [];
  for (const suite of parsed.testResults) {
    if (!suite.name) continue;
    const relFile = normalize(relative(repoRoot, suite.name));
    for (const assertion of suite.assertionResults || []) {
      results.push({
        testFile: relFile,
        fullName: assertion.fullName,
        status: assertion.status,
      });
    }
  }

  return results;
}

/**
 * 将清单中的全部证据项与实际测试报告进行比对，要求状态全为 passed
 */
export function verifyTestResults(manifest, aggregatedReports, repoRoot) {
  const indexed = new Map();
  const duplicateChecks = new Set();

  for (const item of aggregatedReports) {
    const key = `${normalize(item.testFile)}:::${item.fullName}`;
    if (duplicateChecks.has(key)) {
      throw new Error(`Ambiguous test result: duplicate fullName "${item.fullName}" in "${item.testFile}"`);
    }
    duplicateChecks.add(key);
    indexed.set(key, item.status);
  }

  const verifiedEvidences = [];
  for (const evidence of manifest.evidences) {
    const normalizedFile = normalize(evidence.testFile);
    const key = `${normalizedFile}:::${evidence.fullName}`;

    if (!indexed.has(key)) {
      throw new Error(
        `Evidence missing from test reports: [${evidence.id}]\n  File: ${evidence.testFile}\n  FullName: "${evidence.fullName}"`,
      );
    }

    const status = indexed.get(key);
    if (status !== 'passed') {
      throw new Error(
        `Evidence test not passed: [${evidence.id}]\n  Status: "${status}" (expected "passed")\n  File: ${evidence.testFile}\n  FullName: "${evidence.fullName}"`,
      );
    }

    verifiedEvidences.push({ id: evidence.id, status });
  }

  return {
    verifiedCount: verifiedEvidences.length,
    allPassed: true,
  };
}

/**
 * 运行清单涉及的所有测试套件并收集 JSON 报告
 */
export function runAllSuites(repoRoot, manifest) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'm1a-capability-check-'));
  try {
    // 按 package + runner + testFile 去重调度
    const suiteMap = new Map();
    for (const evidence of manifest.evidences) {
      const suiteKey = `${evidence.package}:::${evidence.runner}:::${evidence.testFile}`;
      if (!suiteMap.has(suiteKey)) {
        suiteMap.set(suiteKey, {
          package: evidence.package,
          runner: evidence.runner,
          testFile: evidence.testFile,
        });
      }
    }

    const aggregatedReports = [];
    let suiteIndex = 0;

    for (const suite of suiteMap.values()) {
      suiteIndex += 1;
      const reportFile = join(tmpDir, `report-${suiteIndex}.json`);
      const packageDir = resolve(repoRoot, suite.package);
      const testFileInPkg = relative(packageDir, resolve(repoRoot, suite.testFile));

      const args =
        suite.runner === 'vitest'
          ? ['exec', 'vitest', 'run', testFileInPkg, '--reporter=json', `--outputFile=${reportFile}`]
          : ['exec', 'jest', testFileInPkg, '--json', `--outputFile=${reportFile}`];

      const proc = spawnSync('pnpm', args, {
        cwd: packageDir,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      });

      if (proc.error) {
        throw new Error(`Failed to spawn test runner for ${suite.testFile}: ${proc.error.message}`);
      }

      if (proc.signal) {
        throw new Error(`Test runner killed by signal ${proc.signal} for ${suite.testFile}`);
      }

      if (proc.status !== 0) {
        throw new Error(
          `Test runner exited with code ${proc.status} for ${suite.testFile}.\nStderr: ${proc.stderr}\nStdout: ${proc.stdout}`,
        );
      }

      if (!existsSync(reportFile)) {
        throw new Error(`Test report was not created at ${reportFile} for ${suite.testFile}`);
      }

      const rawReport = readFileSync(reportFile, 'utf8');
      const parsedResults = parseTestReport(rawReport, repoRoot);
      if (parsedResults.length === 0) {
        throw new Error(`Test report for ${suite.testFile} contained zero test results`);
      }

      aggregatedReports.push(...parsedResults);
    }

    return aggregatedReports;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * 主入口函数
 */
export async function main(repoRoot = process.cwd()) {
  console.log('🔍 [check:m1a-capabilities] Starting capability evidence verification...');

  const manifestPath = resolve(repoRoot, 'test-fixtures/m1a-capability-evidence.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Evidence manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // 1. 校验统一定型 Fixture 原始字节 SHA-256 和版本
  console.log('  1. Verifying conformance fixture hash & corpusVersion...');
  const fixtureRes = verifyFixture(manifest, repoRoot);
  console.log(`     ✓ SHA-256: ${fixtureRes.actualSha256} (v${fixtureRes.corpusVersion})`);

  // 2. 校验证据清单结构与 3×6 矩阵完整性
  console.log('  2. Validating evidence manifest schema & 3×6 matrix...');
  const manifestRes = validateEvidenceManifest(manifest, repoRoot);
  console.log(`     ✓ Verified ${manifestRes.evidenceCount} unique evidence citations across all 18 cells & key groups`);

  // 3. 执行真实窄测试并收集结构化 JSON 报告
  console.log('  3. Executing targeted test suites into isolated temporary directory...');
  const testResults = runAllSuites(repoRoot, manifest);
  console.log(`     ✓ Collected ${testResults.length} test assertions from isolated runners`);

  // 4. 比对全部证据项，确保状态全为 passed
  console.log('  4. Matching cited evidence against test report assertions...');
  const verifyRes = verifyTestResults(manifest, testResults, repoRoot);
  console.log(`     ✓ All ${verifyRes.verifiedCount} cited evidences successfully matched with status="passed"`);

  console.log('\n✅ [check:m1a-capabilities] All capability gates and CI evidence checks PASSED.\n');
}

// CLI 执行检测
const isDirectCli =
  process.argv[1] &&
  (process.argv[1].endsWith('check-m1a-capabilities.mjs') ||
    process.argv[1].endsWith('check-m1a-capabilities'));

if (isDirectCli) {
  main(process.cwd()).catch((err) => {
    console.error(`\n❌ [check:m1a-capabilities] FAILED: ${err.message}\n`);
    process.exit(1);
  });
}
