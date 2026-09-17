#!/usr/bin/env node

/**
 * B4 验收组合首建脚本（Issue #39 / M1F-2 B4，review Spec#4）。
 *
 * 面向以 `LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance` 启动的真实后端，
 * 用真实服务端保存入口创建一个 builtin-test 页面并回读服务端生成的
 * runtimeCompatibility 三元组——即 docs/plans/m1f-2-b4-second-preset.md
 * 「首次创建」步骤的可执行形态。
 *
 * 用法：
 *   LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance pnpm --filter @lowcode-platform/backend dev
 *   node scripts/b4-acceptance-bootstrap.mjs \
 *     --base-url http://127.0.0.1:3001/api/v1 \
 *     --page-id b4-acceptance-demo \
 *     --token "$API_SECRET"
 *
 * 期望三元组取自真实包常量 TEST_RUNTIME_COMPATIBILITY（presetId、版本与
 * rendererVersion 逐字段精确比对，非空检查不够）。
 *
 * 退出码：0 成功；1 失败（错误打印到 stderr）。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadExpectedCompatibility() {
  try {
    const backendRequire = createRequire(path.join(repoRoot, 'packages/backend/package.json'));
    const presetTest = backendRequire('@lowcode-platform/preset-test');
    return presetTest.TEST_RUNTIME_COMPATIBILITY;
  } catch (error) {
    console.error(
      'cannot resolve @lowcode-platform/preset-test TEST_RUNTIME_COMPATIBILITY ' +
        '(run: pnpm --filter @lowcode-platform/preset-test build): ' +
        (error?.message ?? error),
    );
    process.exit(1);
  }
}

const EXPECTED_COMPATIBILITY = loadExpectedCompatibility();
const DEFAULT_BASE_URL = 'http://127.0.0.1:3001/api/v1';

const B4_INITIAL_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['intro', 'cta'] },
    intro: {
      id: 'intro',
      type: 'Text',
      props: { children: 'B4 验收页面（builtin-test）', size: 'lg' },
    },
    cta: {
      id: 'cta',
      type: 'Button',
      props: { children: 'test 按钮', variant: 'solid' },
      events: {
        onClick: [
          { type: 'feedback', kind: 'message', content: 'b4 acceptance click', level: 'success' },
        ],
      },
    },
  },
};

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.LOWCODE_BASE_URL ?? DEFAULT_BASE_URL,
    pageId: undefined,
    token: process.env.API_SECRET,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url') {
      args.baseUrl = next;
      i += 1;
    } else if (arg === '--page-id') {
      args.pageId = next;
      i += 1;
    } else if (arg === '--token') {
      args.token = next;
      i += 1;
    }
  }
  return args;
}

/** 后端全局 TransformInterceptor 的响应信封为 { success, data, ... }；兼容无信封形态。 */
function unwrapResponseBody(body) {
  if (
    body &&
    typeof body === 'object' &&
    'data' in body &&
    body.data &&
    typeof body.data === 'object'
  ) {
    return body.data;
  }
  return body;
}

function assertFullTestTriplet(compat) {
  const mismatches = ['componentPresetId', 'componentPresetVersion', 'rendererVersion'].filter(
    (key) => compat?.[key] !== EXPECTED_COMPATIBILITY[key],
  );
  if (mismatches.length > 0) {
    console.error(
      `[b4-bootstrap] runtimeCompatibility mismatch on [${mismatches.join(', ')}]: ` +
        `got ${JSON.stringify(compat)}, expected ${JSON.stringify(EXPECTED_COMPATIBILITY)}; ` +
        'is the backend running with LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance ' +
        'and the same preset-test build?',
    );
    process.exit(1);
  }
}

async function main() {
  const { baseUrl, pageId, token } = parseArgs(process.argv.slice(2));
  if (!pageId) {
    console.error('--page-id is required (e.g. b4-acceptance-demo)');
    process.exit(1);
  }
  if (!token) {
    console.error('Bearer token is required: pass --token or set API_SECRET');
    process.exit(1);
  }

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 1) 真实保存入口首次创建（无 basePageVersion）：服务端此刻绑定 default active 身份
  const saveRes = await fetch(`${baseUrl}/pages/${encodeURIComponent(pageId)}/schema`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ schema: B4_INITIAL_SCHEMA }),
  });
  if (saveRes.status === 409) {
    // 页面已存在（重复运行）：跳过创建，继续用回读校验既有身份
    console.log(
      '[b4-bootstrap] page %s already exists (HTTP 409) — verifying existing binding',
      pageId,
    );
  } else if (!saveRes.ok) {
    throw new Error(`save failed: HTTP ${saveRes.status} ${await saveRes.text()}`);
  } else {
    const saved = unwrapResponseBody(await saveRes.json());
    console.log(
      '[b4-bootstrap] created pageId=%s pageVersion=%s snapshotId=%s',
      pageId,
      saved.pageVersion,
      saved.snapshotId,
    );
  }

  // 2) 回读服务端生成的三元组（页面身份的唯一可信来源），校验完整三元组
  const loadRes = await fetch(`${baseUrl}/pages/${encodeURIComponent(pageId)}/schema`, {
    headers,
  });
  if (!loadRes.ok) {
    throw new Error(`load failed: HTTP ${loadRes.status} ${await loadRes.text()}`);
  }
  const loaded = unwrapResponseBody(await loadRes.json());
  console.log(
    '[b4-bootstrap] server runtimeCompatibility = %s',
    JSON.stringify(loaded.runtimeCompatibility),
  );

  assertFullTestTriplet(loaded.runtimeCompatibility);
  console.log('[b4-bootstrap] OK — open the editor at /b4-acceptance.html?pageId=%s', pageId);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
