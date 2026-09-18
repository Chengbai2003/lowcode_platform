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

const SPECIAL_STRINGS_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: {
      id: 'root',
      type: 'Container',
      childrenIds: [
        't-double',
        't-single',
        't-backslash',
        't-newline',
        't-tab',
        't-backspace',
        't-formfeed',
        't-control',
        't-amp',
        't-lt',
        't-gt',
        't-empty',
      ],
    },
    't-double': {
      id: 't-double',
      type: 'Text',
      props: { id: 't-double', title: 'hello "world" with double quotes' },
    },
    't-single': {
      id: 't-single',
      type: 'Text',
      props: { id: 't-single', title: "it's a 'single quoted' string" },
    },
    't-backslash': {
      id: 't-backslash',
      type: 'Text',
      props: { id: 't-backslash', title: 'path\\to\\file\\with\\backslashes' },
    },
    't-newline': {
      id: 't-newline',
      type: 'Text',
      props: { id: 't-newline', title: 'line1\nline2\r\nline3' },
    },
    't-tab': {
      id: 't-tab',
      type: 'Text',
      props: { id: 't-tab', title: 'a\tb' },
    },
    't-backspace': {
      id: 't-backspace',
      type: 'Text',
      props: { id: 't-backspace', title: 'a\bb' },
    },
    't-formfeed': {
      id: 't-formfeed',
      type: 'Text',
      props: { id: 't-formfeed', title: 'page1\fpage2' },
    },
    't-control': {
      id: 't-control',
      type: 'Text',
      props: { id: 't-control', title: 'null\x00byte and bell\x07' },
    },
    't-amp': {
      id: 't-amp',
      type: 'Text',
      props: { id: 't-amp', title: 'foo & bar &amp; baz' },
    },
    't-lt': {
      id: 't-lt',
      type: 'Text',
      props: { id: 't-lt', title: 'a < b and c > d' },
    },
    't-gt': {
      id: 't-gt',
      type: 'Text',
      props: { id: 't-gt', title: 'x > y' },
    },
    't-empty': {
      id: 't-empty',
      type: 'Text',
      props: { id: 't-empty', title: '' },
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
  const compileOptions = {
    ...presetTest.testCompilerBindings,
    manifest: presetTest.testManifest,
  };

  process.stdout.write(
    JSON.stringify({
      main: {
        code: compileToCode(MAIN_SCHEMA, compileOptions),
        schema: MAIN_SCHEMA,
      },
      dangerous: {
        code: compileToCode(DANGEROUS_SCHEMA, compileOptions),
        schema: DANGEROUS_SCHEMA,
      },
      strings: {
        code: compileToCode(SPECIAL_STRINGS_SCHEMA, compileOptions),
        schema: SPECIAL_STRINGS_SCHEMA,
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
