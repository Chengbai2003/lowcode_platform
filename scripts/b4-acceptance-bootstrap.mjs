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
 * 退出码：0 成功；1 失败（错误打印到 stderr）。
 */

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
  if (!saveRes.ok) {
    throw new Error(`save failed: HTTP ${saveRes.status} ${await saveRes.text()}`);
  }
  const saved = await saveRes.json();
  console.log(
    '[b4-bootstrap] created pageId=%s pageVersion=%s snapshotId=%s',
    pageId,
    saved.pageVersion,
    saved.snapshotId,
  );

  // 2) 回读服务端生成的三元组（页面身份的唯一可信来源）
  const loadRes = await fetch(`${baseUrl}/pages/${encodeURIComponent(pageId)}/schema`, {
    headers,
  });
  if (!loadRes.ok) {
    throw new Error(`load failed: HTTP ${loadRes.status} ${await loadRes.text()}`);
  }
  const loaded = await loadRes.json();
  console.log(
    '[b4-bootstrap] server runtimeCompatibility = %s',
    JSON.stringify(loaded.runtimeCompatibility),
  );

  const compat = loaded.runtimeCompatibility ?? {};
  if (compat.componentPresetId !== 'builtin-test') {
    console.error(
      `[b4-bootstrap] expected builtin-test binding but got ${JSON.stringify(compat)}; ` +
        'is the backend running with LOWCODE_DEPLOYMENT_COMPOSITION=b4-acceptance?',
    );
    process.exit(1);
  }
  console.log('[b4-bootstrap] OK — open the editor at /b4-acceptance.html?pageId=%s', pageId);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
