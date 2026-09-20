import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateM1bEvidenceManifest,
  M1B_CAPABILITY,
  M1B_SURFACES,
  M1B_INGRESS_REJECTIONS,
} from '../check-m1b-capabilities.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const realManifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'test-fixtures/m1b-capability-evidence.json'), 'utf8'),
);

function cloneManifest() {
  return JSON.parse(JSON.stringify(realManifest));
}

test('accepts the real M1b evidence manifest', () => {
  const result = validateM1bEvidenceManifest(cloneManifest(), repoRoot);
  assert.equal(result.valid, true);
  assert.ok(result.evidenceCount > 0);
});

test('rejects a capability other than data-source', () => {
  const manifest = cloneManifest();
  manifest.capability = 'page-state';
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /must be "data-source"/);
});

test('rejects a manifest that records data-source as supported', () => {
  const manifest = cloneManifest();
  manifest.capabilityStatus = 'supported';
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /unsupported/);
});

test('rejects a matrix with a missing surface cell', () => {
  const manifest = cloneManifest();
  delete manifest.matrix[M1B_CAPABILITY][M1B_SURFACES[0]];
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /surfaces count mismatch/);
});

test('rejects a matrix cell that is not an evidence ID string', () => {
  const manifest = cloneManifest();
  manifest.matrix[M1B_CAPABILITY].renderer = 42;
  assert.throws(
    () => validateM1bEvidenceManifest(manifest, repoRoot),
    /must be an evidence ID string/,
  );
});

test('rejects a missing ingress rejection point', () => {
  const manifest = cloneManifest();
  delete manifest.keyGroups.ingressRejections[M1B_INGRESS_REJECTIONS[3]];
  assert.throws(
    () => validateM1bEvidenceManifest(manifest, repoRoot),
    new RegExp(`missing required ingress point: "${M1B_INGRESS_REJECTIONS[3]}"`),
  );
});

test('rejects an empty regressions group', () => {
  const manifest = cloneManifest();
  manifest.keyGroups.regressions = [];
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /keyGroups.regressions/);
});

test('rejects references to nonexistent evidence ids', () => {
  const manifest = cloneManifest();
  manifest.keyGroups.ingressRejections.rendererMount = 'ev-m1b-does-not-exist';
  assert.throws(
    () => validateM1bEvidenceManifest(manifest, repoRoot),
    /references nonexistent evidence id "ev-m1b-does-not-exist"/,
  );
});

test('rejects evidence entries with absolute or escaping testFile paths', () => {
  const manifest = cloneManifest();
  manifest.evidences[0].testFile = '/etc/passwd';
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /escapes repository/);
});

test('rejects testFile paths that escape via interior ".." segments (review finding)', () => {
  const manifest = cloneManifest();
  // 开头不是 ".."，但规范化后已在仓库之外
  manifest.evidences[0].testFile = 'packages/../../package.json';
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /escapes repository/);

  const manifest2 = cloneManifest();
  manifest2.evidences[0].testFile = 'packages/schema-contract/../../../outside-report.json';
  assert.throws(() => validateM1bEvidenceManifest(manifest2, repoRoot), /escapes repository/);
});

test('rejects testFile that resolves to the repository root itself', () => {
  const manifest = cloneManifest();
  manifest.evidences[0].testFile = '.';
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /escapes repository/);
});

test('rejects duplicate evidence ids', () => {
  const manifest = cloneManifest();
  manifest.evidences.push({ ...manifest.evidences[0] });
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /Duplicate evidence id/);
});

test('rejects evidence entries missing description', () => {
  const manifest = cloneManifest();
  delete manifest.evidences[0].description;
  assert.throws(() => validateM1bEvidenceManifest(manifest, repoRoot), /missing "description"/);
});
