#!/usr/bin/env node
/**
 * Schema Contract 架构边界门禁 (Issue #16 / M0-1 PR 4)
 *
 * 检查项：
 *  1. 不允许出现旧类型别名 A2UISchema / A2UIComponent（统一为 Contract 的
 *     PageSchema / ComponentNode）
 *  2. 不允许出现旧协议字段 baseVersion（统一为 basePageVersion）
 *  3. 不允许出现 schema.version 读写（schemaVersion 只描述 DSL 格式，
 *     页面修订版本永远不进入 Schema 对象）
 *  4. 不允许在 Contract 包之外重复声明 PageSchema / ComponentNode interface
 *  5. 不允许 Backend → Frontend 反向依赖（package.json 与源码 import）
 *  6. 不允许消费面 import assertSupportedPageSchema —— 消费边界必须使用
 *     requireSupportedPageSchema（返回 canonical），仅 Contract 包内部可用
 *
 * 用法：node scripts/check-schema-contract-boundaries.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, 'packages');
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '__snapshots__', 'coverage', '.git']);

const violations = [];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXT.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return relative(ROOT, file).split(sep).join('/');
}

// ---------- 收集扫描文件 ----------
const allFiles = [];
for (const pkg of readdirSync(PACKAGES_DIR)) {
  const pkgDir = join(PACKAGES_DIR, pkg);
  if (!statSync(pkgDir).isDirectory()) continue;
  const srcDir = join(pkgDir, 'src');
  try {
    allFiles.push(...walk(srcDir));
  } catch {
    // 包没有 src 目录则跳过
  }
}

// ---------- 1-4 / 6: 源码模式检查 ----------
const patternRules = [
  { name: '旧类型别名 A2UISchema（应使用 Contract PageSchema）', regex: /\bA2UISchema\b/ },
  { name: '旧类型别名 A2UIComponent（应使用 Contract ComponentNode）', regex: /\bA2UIComponent\b/ },
  { name: '旧协议字段 baseVersion（应使用 basePageVersion）', regex: /\bbaseVersion\b/ },
  { name: 'schema.version 读写（页面版本不得进入 Schema 对象）', regex: /\bschema\.version\b/ },
  {
    name: 'assertSupportedPageSchema 消费（边界必须使用 requireSupportedPageSchema 返回 canonical）',
    regex: /\bassertSupportedPageSchema\b/,
    skip: (file) =>
      file.startsWith('packages' + sep + 'schema-contract') ||
      rel(file).startsWith('packages/schema-contract'),
  },
];

const contractSrc = 'packages/schema-contract';
const typeDeclRules = [
  { name: '重复的 PageSchema interface 声明', regex: /\binterface PageSchema\b/ },
  { name: '重复的 ComponentNode interface 声明', regex: /\binterface ComponentNode\b/ },
];

for (const file of allFiles) {
  const relFile = rel(file);
  const inContract = relFile.startsWith(contractSrc + '/');
  const content = readFileSync(file, 'utf-8');

  for (const rule of patternRules) {
    if (rule.skip && rule.skip(file)) continue;
    if (rule.regex.test(content)) {
      // Contract 包内部允许（它就是真相源），包外一律违规
      if (!inContract) violations.push(`${relFile}: ${rule.name}`);
    }
  }

  if (!inContract) {
    for (const rule of typeDeclRules) {
      if (rule.regex.test(content)) {
        violations.push(`${relFile}: ${rule.name}（唯一真相源在 packages/schema-contract）`);
      }
    }
  }
}

// ---------- 5: Backend → Frontend 反向依赖 ----------
try {
  const backendPkg = JSON.parse(
    readFileSync(join(PACKAGES_DIR, 'backend', 'package.json'), 'utf-8'),
  );
  const deps = { ...backendPkg.dependencies, ...backendPkg.devDependencies };
  if (deps['@lowcode-platform/frontend']) {
    violations.push(
      'packages/backend/package.json: Backend → Frontend 反向依赖（@lowcode-platform/frontend）',
    );
  }
} catch {
  violations.push('packages/backend/package.json: 无法读取（Backend → Frontend 依赖检查跳过失败）');
}

for (const file of allFiles) {
  const relFile = rel(file);
  if (!relFile.startsWith('packages/backend/')) continue;
  const content = readFileSync(file, 'utf-8');
  if (
    /from ['"]@lowcode-platform\/frontend['"]/.test(content) ||
    /require\(['"]@lowcode-platform\/frontend['"]\)/.test(content)
  ) {
    violations.push(`${relFile}: Backend → Frontend 源码反向依赖`);
  }
}

// ---------- 7: 关键边界正向断言（必须真实调用 Contract） ----------
const requiredUsages = [
  {
    file: 'packages/frontend/src/renderer/Renderer.tsx',
    reason: 'Renderer 挂载边界必须使用 requireSupportedPageSchema（fail-close）',
  },
  {
    file: 'packages/frontend/src/renderer/index.tsx',
    reason: 'renderFromJSON 必须使用 requireSupportedPageSchema（fail-close）',
  },
  {
    file: 'packages/backend/src/modules/page-schema/repositories/page-schema.repository.ts',
    reason: 'Repository 磁盘/写入边界必须使用 requireSupportedPageSchema（重新校验）',
  },
];
for (const req of requiredUsages) {
  const content = readFileSync(join(ROOT, req.file), 'utf-8');
  if (!/requireSupportedPageSchema/.test(content)) {
    violations.push(`${rel(join(ROOT, req.file))}: ${req.reason}`);
  }
}

// ---------- 8: Renderer 渲染树禁用原始 Schema 引用 ----------
const rendererFile = join(ROOT, 'packages/frontend/src/renderer/Renderer.tsx');
const rendererContent = readFileSync(rendererFile, 'utf-8');
const rendererRawPatterns = [
  {
    name: '渲染树读取原始 schema?.components（必须用 canonicalSchema）',
    regex: /schema\?\.components/,
  },
  { name: '渲染树读取原始 schema?.rootId（必须用 canonicalSchema）', regex: /schema\?\.rootId/ },
  {
    name: '原始 schema 直接作为 useRef 初值（必须用 canonicalSchema）',
    regex: /useRef\(schema\?\./,
  },
];
for (const rule of rendererRawPatterns) {
  if (rule.regex.test(rendererContent)) {
    violations.push(`packages/frontend/src/renderer/Renderer.tsx: ${rule.name}`);
  }
}

// ---------- 结果 ----------
if (violations.length > 0) {
  console.error('✗ Schema Contract 架构边界检查失败：\n');
  for (const v of [...new Set(violations)]) {
    console.error(`  - ${v}`);
  }
  console.error(`\n共 ${new Set(violations).size} 处违规。`);
  process.exit(1);
}

console.log(`✓ Schema Contract 架构边界检查通过（扫描 ${allFiles.length} 个源码文件）。`);
