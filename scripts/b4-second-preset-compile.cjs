#!/usr/bin/env node

/**
 * B4 Second Preset Compilation Bridge (Issue #39 / M1F-2 B4)
 *
 * Invokes the real backend compileToCode generator with the REAL compiler
 * bindings of @lowcode-platform/preset-test (required from the built package
 * dist, so the emitted module imports must actually resolve in a consumer).
 * Used exclusively by the frontend B4 generated-code consumption test via
 * child process; production code never imports backend or this script.
 *
 * Cases:
 * - main:     合法验收页面（Container/Text/Button + message/notification feedback + setValue）
 * - dangerous: Contract 合法但带危险 Props（字符串型 on* / dangerouslySetInnerHTML /
 *             javascript: href）的页面，用于验证 runtime 自防御使编译产物无法注入 DOM
 */

const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const backendPackageJson = path.resolve(repoRoot, 'packages/backend/package.json');
const backendTsConfig = path.resolve(repoRoot, 'packages/backend/tsconfig.json');

const MAIN_SCHEMA = {
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
          {
            type: 'feedback',
            kind: 'notification',
            title: 'b4-compiled-notification',
            content: 'compiled notification description',
            level: 'success',
          },
          { type: 'setValue', field: 'state.count', value: 5 },
        ],
      },
    },
  },
  logic: { states: { count: 0 } },
};

const DANGEROUS_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: {
      id: 'root',
      type: 'Container',
      childrenIds: ['evil-button', 'evil-text'],
      props: { onerror: 'alert(1)' },
    },
    'evil-button': {
      id: 'evil-button',
      type: 'Button',
      props: {
        children: '危险按钮',
        onerror: 'alert(1)',
        onError: 'alert(1)',
        dangerouslySetInnerHTML: { __html: '<b>poison</b>' },
        href: 'javascript:alert(1)',
      },
    },
    'evil-text': {
      id: 'evil-text',
      type: 'Text',
      props: {
        children: '危险文本',
        'data-evil': 'x',
        dangerouslySetInnerHTML: { __html: '<img src=x onerror=alert(2) />' },
      },
    },
  },
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

  process.stdout.write(
    JSON.stringify({
      main: { code: compileToCode(MAIN_SCHEMA, presetTest.testCompilerBindings), schema: MAIN_SCHEMA },
      dangerous: {
        code: compileToCode(DANGEROUS_SCHEMA, presetTest.testCompilerBindings),
        schema: DANGEROUS_SCHEMA,
      },
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
