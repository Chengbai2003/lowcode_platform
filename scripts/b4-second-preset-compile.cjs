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

const fs = require('node:fs');
const os = require('node:os');
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

function buildTestBackendGraph(backendRequire, repo) {
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

async function createRealRepository(backendRequire, storeFilePath) {
  const { PageSchemaRepository } = backendRequire(
    './src/modules/page-schema/repositories/page-schema.repository',
  );
  const repo = new PageSchemaRepository();
  repo.storeFilePath = storeFilePath;
  await repo.onModuleInit();
  return repo;
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

async function computePatchCases(backendRequire) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-patch-cases-'));
  const storeFilePath = path.join(tmpDir, 'page-schema-store.json');

  try {
    const repo = await createRealRepository(backendRequire, storeFilePath);
    const graph = buildTestBackendGraph(backendRequire, repo);

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
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function handleSaveAndCompile(backendRequire, payloadJson) {
  const { pageId, schema, basePageVersion } = JSON.parse(payloadJson);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-save-cas-'));
  const storeFilePath = path.join(tmpDir, 'page-schema-store.json');

  try {
    // 1. 真实仓储实例 1：通过 PageSchemaRepository 执行首建（持久化至独立临时文件，绑定 b4-acceptance 下的 builtin-test 三元组，pageVersion = 1）
    const repo1 = await createRealRepository(backendRequire, storeFilePath);
    const graph1 = buildTestBackendGraph(backendRequire, repo1);

    const initial = await graph1.pageService.saveSchema({
      pageId,
      schema: B4_TEST_PAGE_SCHEMA,
    });
    if (initial.pageVersion !== 1) {
      throw new Error(`Expected initial pageVersion 1, got ${initial.pageVersion}`);
    }

    // 2. 真实 CAS 保存：使用前端重放后的 schema 和 basePageVersion 提交
    //    若 basePageVersion 错误，真实 PageSchemaRepository 抛出 ConflictException (409)
    const saved = await graph1.pageService.saveSchema({
      pageId,
      schema,
      basePageVersion,
    });

    // 3. 验证独立临时文件已真实落地到磁盘，且包含新快照
    const rawDisk = fs.readFileSync(storeFilePath, 'utf8');
    const diskData = JSON.parse(rawDisk);
    const diskPage = diskData.pages.find((p) => p.pageId === pageId);
    if (!diskPage || diskPage.currentPageVersion !== saved.pageVersion) {
      throw new Error(`Store file on disk does not reflect saved pageVersion ${saved.pageVersion}`);
    }

    // 4. “保存后回读并编译”：以同一存储文件初始化全新的真实仓储实例 2，模拟真实重启/重读
    const repo2 = await createRealRepository(backendRequire, storeFilePath);
    const graph2 = buildTestBackendGraph(backendRequire, repo2);
    const reloaded = await graph2.pageService.getSchema(pageId);
    if (reloaded.pageVersion !== saved.pageVersion) {
      throw new Error(
        `Reloaded page version mismatch: expected ${saved.pageVersion}, got ${reloaded.pageVersion}`,
      );
    }

    const compiled = await graph2.compilerService.compile({
      schema: reloaded.schema,
      options: { pageId, pageVersion: reloaded.pageVersion },
    });

    // 5. “再断言旧版本保存被拒绝”：向真实仓储提交过期的 basePageVersion（旧版本 1），验证被真实 CAS 拒绝
    let staleRejected = false;
    let staleErrorStatus = null;
    let staleErrorMessage = null;
    try {
      await graph2.pageService.saveSchema({
        pageId,
        schema: reloaded.schema,
        basePageVersion: 1, // 当前最新已是 2，版本 1 必须被拒绝
      });
    } catch (error) {
      staleRejected = true;
      staleErrorStatus = typeof error.getStatus === 'function' ? error.getStatus() : null;
      staleErrorMessage = error?.message || String(error);
    }

    if (!staleRejected) {
      throw new Error('Expected stale basePageVersion save to be rejected by PageSchemaRepository CAS');
    }

    process.stdout.write(
      JSON.stringify({
        savedPageVersion: saved.pageVersion,
        reloadedPageVersion: reloaded.pageVersion,
        staleRejected,
        staleErrorStatus,
        staleErrorMessage,
        storeFileVerified: true,
        code: compiled.code,
      }),
    );
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  const backendRequire = createRequire(backendPackageJson);
  const tsNode = backendRequire('ts-node');
  tsNode.register({
    project: backendTsConfig,
    transpileOnly: true,
  });

  const args = process.argv.slice(2);
  if (args[0] === '--save-and-compile') {
    await handleSaveAndCompile(backendRequire, args[1]);
    return;
  }

  const { compileToCode } = backendRequire('./src/modules/compiler/generator');
  const presetTest = backendRequire('@lowcode-platform/preset-test');
  const compileOptions = {
    ...presetTest.testCompilerBindings,
    manifest: presetTest.testManifest,
  };

  const patchCases = await computePatchCases(backendRequire);

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
