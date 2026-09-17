#!/usr/bin/env node

/**
 * B4 Second Preset Compilation Bridge (Issue #39 / M1F-2 B4)
 *
 * Invokes the real backend compileToCode generator with the REAL compiler
 * bindings of @lowcode-platform/preset-test (required from the built package
 * dist, so the emitted module imports must actually resolve in a consumer).
 * Used exclusively by the frontend B4 generated-code consumption test via
 * child process; production code never imports backend or this script.
 */

const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const backendPackageJson = path.resolve(repoRoot, 'packages/backend/package.json');
const backendTsConfig = path.resolve(repoRoot, 'packages/backend/tsconfig.json');

// 与前端 404 bootstrap 用例一致的 B4 验收 fixture：仅使用 builtin-test 支持的
// Container/Text/Button，Button 带可观察的 setValue 点击行为。
const B4_PRESET_TEST_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['intro', 'increment-button'] },
    intro: { id: 'intro', type: 'Text', props: { children: 'b4-preset-test-counter' } },
    'increment-button': {
      id: 'increment-button',
      type: 'Button',
      props: { children: 'increment', variant: 'solid' },
      events: {
        onClick: [
          { type: 'feedback', kind: 'message', content: 'b4-compiled-click', level: 'success' },
          { type: 'setValue', field: 'state.count', value: 5 },
        ],
      },
    },
  },
  logic: { states: { count: 0 } },
};

function main() {
  const backendRequire = createRequire(backendPackageJson);
  const tsNode = backendRequire('ts-node');
  tsNode.register({
    project: backendTsConfig,
    transpileOnly: true,
  });

  const { compileToCode } = backendRequire('./src/modules/compiler/generator');
  const presetTest = backendRequire('@lowcode-platform/preset-test');

  const code = compileToCode(B4_PRESET_TEST_SCHEMA, presetTest.testCompilerBindings);

  process.stdout.write(
    JSON.stringify({
      code,
      schema: B4_PRESET_TEST_SCHEMA,
      runtimeCompatibility: presetTest.TEST_RUNTIME_COMPATIBILITY,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
