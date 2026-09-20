#!/usr/bin/env node
/**
 * M1b-1 PR A: Data-Source Capability Default-Deny Evidence Verifier
 *
 * Requirements (m1b-execution-plan.md §4 PR A / Refs #64):
 * 1. Verifies the M1b datasource conformance fixture sha256 and corpusVersion (M1a fixture untouched).
 * 2. Validates evidence manifest structure: 1 capability (data-source) × 6 surfaces,
 *    trusted manifest registry evidence, 9 ingress rejection points, agent early rejections,
 *    and M1a/legacy regressions.
 * 3. Executes the cited test suites in isolated temp dirs and verifies exact fullName matches
 *    with status="passed" — no "all green" claims without per-citation proof.
 * 4. Pure Node stdlib; reuses the M1a verifier's runner/matching kernel.
 *
 * Usage: node scripts/check-m1b-capabilities.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  verifyFixture,
  parseTestReport,
  verifyTestResults,
  runAllSuites,
} from './check-m1a-capabilities.mjs';

export const M1B_CAPABILITY = 'data-source';
export const M1B_SURFACES = Object.freeze([
  'contract',
  'validator',
  'editor-agent',
  'renderer',
  'compiler',
  'storage',
]);
export const M1B_KEY_GROUPS = Object.freeze([
  'trustedManifestRegistry',
  'ingressRejections',
  'agentEarlyRejections',
  'regressions',
]);
export const M1B_INGRESS_REJECTIONS = Object.freeze([
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

/**
 * 校验 M1b 证据清单结构（独立于 M1a 3×6 清单；生产能力矩阵本身由
 * schema-contract capabilities.spec 的 trusted-manifest 用例证明）
 */
export function validateM1bEvidenceManifest(manifest, repoRoot) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('M1b evidence manifest must be a JSON object');
  }
  if (manifest.evidenceFormatVersion !== 1) {
    throw new Error(`Unsupported evidenceFormatVersion: ${manifest.evidenceFormatVersion}`);
  }
  if (manifest.capability !== M1B_CAPABILITY) {
    throw new Error(
      `Manifest capability must be "${M1B_CAPABILITY}", got "${manifest.capability}"`,
    );
  }
  if (
    typeof manifest.capabilityStatus !== 'string' ||
    !manifest.capabilityStatus.includes('unsupported')
  ) {
    throw new Error('M1b manifest must record data-source as unsupported (default-deny)');
  }

  // 1. 矩阵：data-source × 6 面，每格一个证据 ID（PR A 阶段六面均为拒绝证据）
  if (!manifest.matrix || typeof manifest.matrix !== 'object') {
    throw new Error('Manifest missing "matrix" mapping');
  }
  const matrixCaps = Object.keys(manifest.matrix);
  if (matrixCaps.length !== 1 || matrixCaps[0] !== M1B_CAPABILITY) {
    throw new Error(`Matrix must contain exactly one capability "${M1B_CAPABILITY}"`);
  }
  const surfaces = Object.keys(manifest.matrix[M1B_CAPABILITY]);
  if (surfaces.length !== M1B_SURFACES.length) {
    throw new Error(
      `Matrix surfaces count mismatch: expected exactly ${M1B_SURFACES.length}, got ${surfaces.length}`,
    );
  }
  for (const surface of M1B_SURFACES) {
    const cell = manifest.matrix[M1B_CAPABILITY][surface];
    if (typeof cell !== 'string' || !cell) {
      throw new Error(`Matrix cell [${M1B_CAPABILITY}][${surface}] must be an evidence ID string`);
    }
  }

  // 2. 关键分组
  if (!manifest.keyGroups || typeof manifest.keyGroups !== 'object') {
    throw new Error('Manifest missing "keyGroups" object');
  }
  for (const group of M1B_KEY_GROUPS) {
    if (!manifest.keyGroups[group]) {
      throw new Error(`keyGroups missing required group: "${group}"`);
    }
  }
  const ingressObj = manifest.keyGroups.ingressRejections;
  for (const ingressKey of M1B_INGRESS_REJECTIONS) {
    if (!ingressObj[ingressKey] || typeof ingressObj[ingressKey] !== 'string') {
      throw new Error(
        `keyGroups.ingressRejections missing required ingress point: "${ingressKey}"`,
      );
    }
  }
  for (const arrayGroup of ['trustedManifestRegistry', 'agentEarlyRejections', 'regressions']) {
    if (
      !Array.isArray(manifest.keyGroups[arrayGroup]) ||
      manifest.keyGroups[arrayGroup].length === 0
    ) {
      throw new Error(`keyGroups.${arrayGroup} must be a non-empty array of evidence IDs`);
    }
  }

  // 3. 证据条目
  if (!Array.isArray(manifest.evidences) || manifest.evidences.length === 0) {
    throw new Error('Manifest "evidences" must be a non-empty array');
  }
  const evidenceMap = new Map();
  for (const evidence of manifest.evidences) {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('Each evidence entry must be an object');
    }
    const { id, package: pkg, runner, testFile, fullName, description } = evidence;
    if (!id || typeof id !== 'string') throw new Error('Evidence entry missing id string');
    if (evidenceMap.has(id)) throw new Error(`Duplicate evidence id: "${id}"`);
    if (!pkg || typeof pkg !== 'string') throw new Error(`Evidence "${id}" missing "package"`);
    if (runner !== 'vitest' && runner !== 'jest') {
      throw new Error(`Evidence "${id}" runner must be "vitest" or "jest", got "${runner}"`);
    }
    if (!testFile || typeof testFile !== 'string')
      throw new Error(`Evidence "${id}" missing "testFile"`);
    // 路径逃逸校验：先 resolve 再做仓库内包含性检查（仅看开头挡不住
    // "packages/../../outside" 这类中间 .. 的绕过），仓库根本身也不算合法证据文件
    const resolvedPath = resolve(repoRoot, testFile);
    if (!resolvedPath.startsWith(repoRoot + sep)) {
      throw new Error(
        `Evidence "${id}" testFile escapes repository: "${testFile}" (resolved to "${resolvedPath}")`,
      );
    }
    if (!existsSync(resolvedPath)) {
      throw new Error(`Evidence "${id}" testFile does not exist: "${testFile}"`);
    }
    if (!fullName || typeof fullName !== 'string')
      throw new Error(`Evidence "${id}" missing "fullName"`);
    if (!description || typeof description !== 'string') {
      throw new Error(`Evidence "${id}" missing "description"`);
    }
    evidenceMap.set(id, evidence);
  }

  // 4. 引用解析：矩阵 + 全部分组
  const resolveRef = (refId, where) => {
    if (!evidenceMap.has(refId)) {
      throw new Error(`${where} references nonexistent evidence id "${refId}"`);
    }
  };
  for (const surface of M1B_SURFACES) {
    resolveRef(
      manifest.matrix[M1B_CAPABILITY][surface],
      `Matrix cell [${M1B_CAPABILITY}][${surface}]`,
    );
  }
  for (const [k, refId] of Object.entries(ingressObj)) {
    resolveRef(refId, `keyGroups.ingressRejections.${k}`);
  }
  for (const arrayGroup of ['trustedManifestRegistry', 'agentEarlyRejections', 'regressions']) {
    for (const refId of manifest.keyGroups[arrayGroup]) {
      resolveRef(refId, `keyGroups.${arrayGroup}`);
    }
  }

  return { valid: true, evidenceCount: evidenceMap.size };
}

export async function main(repoRoot = process.cwd()) {
  console.log(
    '🔍 [check:m1b-capabilities] Starting data-source default-deny evidence verification...',
  );

  const manifestPath = resolve(repoRoot, 'test-fixtures/m1b-capability-evidence.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`M1b evidence manifest not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  console.log('  1. Verifying M1b datasource conformance fixture hash & corpusVersion...');
  const fixtureRes = verifyFixture(manifest, repoRoot);
  console.log(`     ✓ SHA-256: ${fixtureRes.actualSha256} (v${fixtureRes.corpusVersion})`);

  console.log(
    '  2. Validating M1b evidence manifest (1 capability × 6 surfaces + 9 ingress points + regressions)...',
  );
  const manifestRes = validateM1bEvidenceManifest(manifest, repoRoot);
  console.log(
    `     ✓ Verified ${manifestRes.evidenceCount} evidence citations across matrix, ingress and regression groups`,
  );

  console.log('  3. Executing cited test suites into isolated temporary directory...');
  const testResults = await runAllSuites(repoRoot, manifest);
  console.log(`     ✓ Collected ${testResults.length} test assertions from isolated runners`);

  console.log('  4. Matching cited evidence against test report assertions...');
  const verifyRes = verifyTestResults(manifest, testResults, repoRoot);
  console.log(`     ✓ All ${verifyRes.verifiedCount} cited evidences matched with status="passed"`);

  console.log(
    '\n✅ [check:m1b-capabilities] data-source capability remains default-unsupported with per-entrance rejection evidence.\n',
  );
}

const isDirectCli =
  process.argv[1] &&
  (process.argv[1].endsWith('check-m1b-capabilities.mjs') ||
    process.argv[1].endsWith('check-m1b-capabilities'));

if (isDirectCli) {
  main(process.cwd()).catch((err) => {
    console.error(`\n❌ [check:m1b-capabilities] FAILED: ${err.message}\n`);
    process.exit(1);
  });
}
