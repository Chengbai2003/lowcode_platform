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

function buildTestBackendGraph(backendRequire) {
  const { Logger } = backendRequire('@nestjs/common');
  Logger.overrideLogger(false);

  const { getDeploymentComposition } = backendRequire(
    './src/modules/runtime-profile/deployment-composition',
  );
  const { DeploymentRuntimeProfileRegistry } = backendRequire(
    './src/modules/runtime-profile/deployment-runtime-profile-registry',
  );
  const { PageSchemaService } = backendRequire('./src/modules/page-schema/page-schema.service');
  const { PageRuntimeMetadataProvider } = backendRequire(
    './src/modules/page-schema/page-runtime-metadata.provider',
  );
  const { ComponentMetaRegistry } = backendRequire(
    './src/modules/schema-context/component-metadata/component-meta.registry',
  );
  const { SchemaResolverService } = backendRequire(
    './src/modules/schema-context/schema-resolver.service',
  );
  const { ContextAssemblerService } = backendRequire(
    './src/modules/schema-context/context-assembler.service',
  );
  const { SchemaSlicerService } = backendRequire(
    './src/modules/schema-context/schema-slicer.service',
  );
  const { NodeLocatorService } = backendRequire(
    './src/modules/schema-context/node-locator.service',
  );
  const { PatchValidationService } = backendRequire(
    './src/modules/agent-tools/patch-validation.service',
  );
  const { PatchApplyService } = backendRequire('./src/modules/agent-tools/patch-apply.service');
  const { PatchAutoFixService } = backendRequire('./src/modules/agent-tools/patch-auto-fix.service');
  const { ToolExecutionService } = backendRequire(
    './src/modules/agent-tools/tool-execution.service',
  );
  const { ToolRegistryService } = backendRequire('./src/modules/agent-tools/tool-registry.service');
  const { CompilerService } = backendRequire('./src/modules/compiler/compiler.service');

  const composition = getDeploymentComposition('b4-acceptance');
  const registry = new DeploymentRuntimeProfileRegistry(
    composition.profiles,
    composition.compilerBindings,
    composition.componentMetas,
    composition.manifests,
  );

  const pages = new Map();
  const snapshots = new Map();
  const repo = {
    getPage: (id) => pages.get(id),
    getLatestSnapshot: (id) => {
      const page = pages.get(id);
      if (!page) return undefined;
      return (snapshots.get(id) ?? []).find((s) => s.snapshotId === page.latestSnapshotId);
    },
    getSnapshotByVersion: (id, ver) =>
      (snapshots.get(id) ?? []).find((s) => s.pageVersion === ver),
    saveSchema: async (params) => {
      const existing = pages.get(params.pageId);
      const currentVersion = existing?.currentPageVersion ?? 0;
      if (existing && params.basePageVersion === undefined) {
        throw new Error('Page version mismatch: existing page requires basePageVersion');
      }
      if (params.basePageVersion !== undefined && params.basePageVersion !== currentVersion) {
        throw new Error(
          `Page version mismatch: expected ${currentVersion}, got ${params.basePageVersion}`,
        );
      }
      const nextVersion = currentVersion + 1;
      const snapshotId = `snap-${params.pageId}-v${nextVersion}`;
      const snapshot = {
        snapshotId,
        pageId: params.pageId,
        pageVersion: nextVersion,
        schema: params.schema,
        runtimeCompatibility: params.runtimeCompatibility,
        createdAt: new Date().toISOString(),
      };
      const record = {
        pageId: params.pageId,
        systemId: params.systemId,
        currentPageVersion: nextVersion,
        latestSnapshotId: snapshotId,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      pages.set(params.pageId, record);
      const list = snapshots.get(params.pageId) ?? [];
      list.push(snapshot);
      snapshots.set(params.pageId, list);
      return { page: record, snapshot };
    },
  };

  const metadataProvider = new PageRuntimeMetadataProvider(registry);
  const pageService = new PageSchemaService(repo, metadataProvider);
  const schemaResolver = new SchemaResolverService(pageService, registry);
  const contextAssembler = new ContextAssemblerService(
    schemaResolver,
    new NodeLocatorService(new ComponentMetaRegistry()),
    new SchemaSlicerService(),
    new ComponentMetaRegistry(),
    registry,
  );
  const applyService = new PatchApplyService();
  const validationService = new PatchValidationService(
    new ComponentMetaRegistry(),
    applyService,
    registry,
  );
  const autoFixService = new PatchAutoFixService();
  const toolRegistry = new ToolRegistryService(
    contextAssembler,
    new ComponentMetaRegistry(),
    { resolve: () => {} },
    autoFixService,
    validationService,
    registry,
  );
  const toolService = new ToolExecutionService(
    pageService,
    contextAssembler,
    toolRegistry,
    registry,
  );
  const compilerService = new CompilerService(pageService, registry);

  return {
    pageService,
    toolRegistry,
    toolService,
    compilerService,
  };
}

const B4_TEST_PAGE_SCHEMA = {
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['hint', 'cta'] },
    hint: { id: 'hint', type: 'Text', props: { children: 'b4 验收页面' } },
    cta: { id: 'cta', type: 'Button', props: { children: 'test 按钮', variant: 'solid' } },
  },
};

async function computePatchCases(graph) {
  const cases = {
    aliasInsert: [
      {
        op: 'insertComponent',
        parentId: 'root',
        component: { id: 'alias-cta', type: 'Action', props: { children: '别名按钮' } },
      },
    ],
    aliasInsertThenRemove: [
      {
        op: 'insertComponent',
        parentId: 'root',
        component: { id: 'temp-cta', type: 'Action', props: { children: '临时按钮' } },
      },
      {
        op: 'removeComponent',
        componentId: 'temp-cta',
      },
    ],
    sameIdRecreate: [
      {
        op: 'insertComponent',
        parentId: 'root',
        component: { id: 'slot-1', type: 'Action', props: { children: '先建按钮' } },
      },
      {
        op: 'removeComponent',
        componentId: 'slot-1',
      },
      {
        op: 'insertComponent',
        parentId: 'root',
        component: { id: 'slot-1', type: 'Caption', props: { children: '后建文本' } },
      },
    ],
  };

  const previewTool = graph.toolRegistry.get('preview_patch');
  const result = {};

  for (const [caseName, inputPatch] of Object.entries(cases)) {
    const pageId = `bridge-${caseName}`;
    await graph.pageService.saveSchema({ pageId, schema: B4_TEST_PAGE_SCHEMA });
    const ctx = await graph.toolService.createExecutionContext({ pageId }, `trace-${caseName}`);
    const accepted = await previewTool.execute({ patch: inputPatch }, ctx);

    result[caseName] = {
      baseSchema: B4_TEST_PAGE_SCHEMA,
      inputPatch,
      returnedPatch: accepted.data.patch,
      updatedWorkingSchema: accepted.updatedWorkingSchema,
      initialPageVersion: 1,
    };
  }

  return result;
}

async function handleSaveAndCompile(graph, payloadJson) {
  const { pageId, schema, basePageVersion } = JSON.parse(payloadJson);
  if (basePageVersion === 1) {
    try {
      await graph.pageService.saveSchema({ pageId, schema: B4_TEST_PAGE_SCHEMA });
    } catch {
      // ignore if already seeded
    }
  }

  const saved = await graph.pageService.saveSchema({
    pageId,
    schema,
    basePageVersion,
  });

  const compiled = await graph.compilerService.compile({
    schema,
    options: { pageId, pageVersion: saved.pageVersion },
  });

  process.stdout.write(
    JSON.stringify({
      savedPageVersion: saved.pageVersion,
      code: compiled.code,
    }),
  );
}

async function main() {
  const backendRequire = createRequire(backendPackageJson);
  const tsNode = backendRequire('ts-node');
  tsNode.register({
    project: backendTsConfig,
    transpileOnly: true,
  });

  const graph = buildTestBackendGraph(backendRequire);

  const args = process.argv.slice(2);
  if (args[0] === '--save-and-compile') {
    await handleSaveAndCompile(graph, args[1]);
    return;
  }

  const { compileToCode } = backendRequire('./src/modules/compiler/generator');
  const presetTest = backendRequire('@lowcode-platform/preset-test');
  const compileOptions = {
    ...presetTest.testCompilerBindings,
    manifest: presetTest.testManifest,
  };

  const patchCases = await computePatchCases(graph);

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
      patchCases,
    }),
  );
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
