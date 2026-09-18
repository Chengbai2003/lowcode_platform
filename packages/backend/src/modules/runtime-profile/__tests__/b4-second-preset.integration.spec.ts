/**
 * B4 第二个可信 Preset 端到端集成矩阵（Issue #39 / M1F-2 B4）。
 *
 * 与 B3 矩阵不同：本文件不手工编造 preset/binding/meta 数据，全部使用
 * `deployment-composition.ts` 声明的真实部署组合与 `@lowcode-platform/preset-test`
 * 真实包资产，服务图为真实生产服务（PageSchemaService / SchemaResolverService /
 * ContextAssembler / ToolRegistry / ToolExecution / PatchValidation / CompilerService +
 * 真实 generator），仅仓储为内存实现、模型不参与。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { requireSupportedPageSchema } from '@lowcode-platform/schema-contract';
import { TEST_PRESET_ID, TEST_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-test';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';

/**
 * 真实消费证明：生成代码的导入路径 `@lowcode-platform/preset-test/runtime`
 * 必须在消费者（backend）运行时实际可解析（Node exports map 子路径），
 * 且绑定类型与 message 都是命名导出。
 */
const presetTestRuntimeModule = require('@lowcode-platform/preset-test/runtime') as Record<
  string,
  unknown
>;
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { PageRuntimeMetadataProvider } from '../../page-schema/page-runtime-metadata.provider';
import {
  PageSchemaRepository,
  type PageSnapshotRecord,
  type StoredPageRecord,
} from '../../page-schema/repositories/page-schema.repository';
import {
  DeploymentRuntimeProfileRegistry,
  type CompilerBindings,
} from '../deployment-runtime-profile-registry';
import { getDeploymentComposition } from '../deployment-composition';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { SchemaResolverService } from '../../schema-context/schema-resolver.service';
import { ContextAssemblerService } from '../../schema-context/context-assembler.service';
import { SchemaSlicerService } from '../../schema-context/schema-slicer.service';
import { NodeLocatorService } from '../../schema-context/node-locator.service';
import { CompilerService } from '../../compiler/compiler.service';
import { ToolExecutionService } from '../../agent-tools/tool-execution.service';
import { AgentToolException } from '../../agent-tools/agent-tool.exception';
import { PatchApplyService } from '../../agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../../agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../../agent-tools/patch-validation.service';
import { ToolRegistryService } from '../../agent-tools/tool-registry.service';

/** 仅使用 builtin-test 支持的 Container/Text/Button 的合法 Schema。 */
const B4_TEST_PAGE_SCHEMA: PageSchema = Object.freeze({
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Container', childrenIds: ['hint', 'cta'] },
    hint: { id: 'hint', type: 'Text', props: { children: 'b4 验收页面' } },
    cta: { id: 'cta', type: 'Button', props: { children: 'test 按钮', variant: 'solid' } },
  },
});

/** AntD 页面 Schema（Page/Button 均为 antd 支持类型）。 */
const ANT_PAGE_SCHEMA: PageSchema = Object.freeze({
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['btn-1'] },
    'btn-1': { id: 'btn-1', type: 'Button', props: { children: 'antd 按钮' } },
  },
});

function createInMemoryRepository(): PageSchemaRepository {
  const pages = new Map<string, StoredPageRecord>();
  const snapshots = new Map<string, PageSnapshotRecord[]>();

  const repo = {
    onModuleInit: jest.fn(),
    getPage: jest.fn((pageId: string) => pages.get(pageId)),
    getLatestSnapshot: jest.fn((pageId: string) => {
      const page = pages.get(pageId);
      if (!page) return undefined;
      const list = snapshots.get(pageId) ?? [];
      return list.find((s) => s.snapshotId === page.latestSnapshotId);
    }),
    getSnapshotByVersion: jest.fn((pageId: string, pageVersion: number) => {
      const list = snapshots.get(pageId) ?? [];
      return list.find((s) => s.pageVersion === pageVersion);
    }),
    saveSchema: jest.fn(
      async (params: {
        pageId: string;
        schema: PageSchema;
        basePageVersion?: number;
        systemId: string;
        runtimeCompatibility: RuntimeCompatibility;
      }) => {
        const existing = pages.get(params.pageId);
        const currentVersion = existing?.currentPageVersion ?? 0;
        if (existing && params.basePageVersion === undefined) {
          throw new ConflictException({
            message: 'Page version mismatch: existing page requires basePageVersion',
            pageId: params.pageId,
            expectedVersion: currentVersion,
            receivedVersion: null,
          });
        }
        if (params.basePageVersion !== undefined && params.basePageVersion !== currentVersion) {
          throw new ConflictException({
            message: 'Page version mismatch',
            pageId: params.pageId,
            expectedVersion: currentVersion,
            receivedVersion: params.basePageVersion,
          });
        }
        const nextVersion = currentVersion + 1;
        const snapshotId = `snap-${params.pageId}-v${nextVersion}`;
        const snapshot: PageSnapshotRecord = {
          snapshotId,
          pageId: params.pageId,
          pageVersion: nextVersion,
          schema: params.schema,
          runtimeCompatibility: params.runtimeCompatibility,
          createdAt: new Date().toISOString(),
        };
        const pageRecord: StoredPageRecord = {
          pageId: params.pageId,
          systemId: params.systemId,
          currentPageVersion: nextVersion,
          latestSnapshotId: snapshotId,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        pages.set(params.pageId, pageRecord);
        const list = snapshots.get(params.pageId) ?? [];
        list.push(snapshot);
        snapshots.set(params.pageId, list);
        return { page: pageRecord, snapshot };
      },
    ),
  };
  return repo as unknown as PageSchemaRepository;
}

function createRegistryForComposition(compositionId: 'default' | 'b4-acceptance') {
  const composition = getDeploymentComposition(compositionId);
  return new DeploymentRuntimeProfileRegistry(
    composition.profiles,
    composition.compilerBindings,
    composition.componentMetas,
    composition.manifests,
  );
}

function createServiceGraph(
  registry: DeploymentRuntimeProfileRegistry,
  repo: PageSchemaRepository,
) {
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
  const collectionResolver = { resolve: jest.fn() };
  const toolRegistry = new ToolRegistryService(
    contextAssembler,
    new ComponentMetaRegistry(),
    collectionResolver as never,
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
    schemaResolver,
    contextAssembler,
    toolRegistry,
    toolService,
    validationService,
    compilerService,
    applyService,
  };
}

describe('B4 Second Trusted Preset Integration Matrix (Issue #39)', () => {
  let repo: PageSchemaRepository;
  let acceptanceRegistry: DeploymentRuntimeProfileRegistry;

  beforeEach(() => {
    repo = createInMemoryRepository();
    acceptanceRegistry = createRegistryForComposition('b4-acceptance');
  });

  describe('Scenario 1: 验收组合真实首次保存 → 服务端生成 test 精确三元组', () => {
    it('new page binds builtin-test@0.1.0 and schema stays pure data', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);

      const saved = await graph.pageService.saveSchema({
        pageId: 'b4-page-1',
        schema: B4_TEST_PAGE_SCHEMA,
        // 客户端伪造字段必须被服务端忽略
        systemId: 'attacker-system',
        runtimeCompatibility: {
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '0.1.0',
          rendererVersion: '1.0.0',
        },
      } as never);

      expect(saved.pageVersion).toBe(1);
      const snapshot = repo.getLatestSnapshot('b4-page-1');
      expect(snapshot!.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);
      expect(repo.getPage('b4-page-1')!.systemId).toBe('default');

      const rawSchema = snapshot!.schema as unknown as Record<string, unknown>;
      expect(rawSchema.systemId).toBeUndefined();
      expect(rawSchema.runtimeCompatibility).toBeUndefined();
      expect(rawSchema.compilerBindingId).toBeUndefined();
    });
  });

  describe('Scenario 2: 真实回读（加载/预览身份来源）', () => {
    it('getSchema and resolveWithCompatibility return the exact server tuple', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-page-2', schema: B4_TEST_PAGE_SCHEMA });

      const loaded = await graph.pageService.getSchema('b4-page-2');
      expect(loaded.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);
      expect(loaded.schema.components['cta']?.props?.children).toBe('test 按钮');

      const resolved = await graph.schemaResolver.resolveWithCompatibility({ pageId: 'b4-page-2' });
      expect(resolved.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);
    });
  });

  describe('Scenario 3: Agent 编辑链读取新 Meta / 别名并校验 Patch', () => {
    it('context carries test tuple; get_component_meta reads test meta and aliases', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-agent', schema: B4_TEST_PAGE_SCHEMA });

      const ctx = await graph.toolService.createExecutionContext(
        { pageId: 'b4-agent' },
        'trace-b4',
      );
      expect(ctx.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);

      const meta = await graph.toolService.executeTool(
        'get_component_meta',
        { type: 'Button' },
        ctx,
      );
      const displayName = (meta.data as { component?: { displayName?: string } }).component
        ?.displayName;
      expect(displayName).toBe('测试按钮');

      // 本 Preset 别名 Action → Button；AntD 别名 Btn 不可见
      const aliasMeta = await graph.toolService.executeTool(
        'get_component_meta',
        { type: 'Action' },
        ctx,
      );
      expect(
        (aliasMeta.data as { component?: { displayName?: string } }).component?.displayName,
      ).toBe('测试按钮');
      const crossAliasMeta = await graph.toolService.executeTool(
        'get_component_meta',
        { type: 'Btn' },
        ctx,
      );
      expect(
        (crossAliasMeta.data as { component?: { displayName?: string } }).component,
      ).toBeUndefined();
    });

    it('legal canonical insert completes the full loop: preview → save → compile', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-patch', schema: B4_TEST_PAGE_SCHEMA });

      const previewTool = graph.toolRegistry.get('preview_patch')!;
      const ctx = await graph.toolService.createExecutionContext(
        { pageId: 'b4-patch' },
        'trace-patch-b4',
      );

      // 合法：规范类型 Button + 本 Preset 支持的 Props
      const accepted = await previewTool.execute(
        {
          patch: [
            {
              op: 'insertComponent',
              parentId: 'root',
              component: {
                id: 'cta-2',
                type: 'Button',
                props: { children: '第二个按钮', variant: 'outline' },
              },
            },
          ],
        },
        ctx as never,
      );
      const updated = accepted.updatedWorkingSchema as PageSchema;
      expect(updated.components['cta-2']?.type).toBe('Button');

      // 确认后真实保存（CAS），再对已保存页面执行真实编译——导出闭环
      const saved = await graph.pageService.saveSchema({
        pageId: 'b4-patch',
        schema: updated,
        basePageVersion: 1,
      });
      expect(saved.pageVersion).toBe(2);

      const compiled = await graph.compilerService.compile({
        schema: updated as unknown as Record<string, unknown>,
        options: { pageId: 'b4-patch', pageVersion: 2 },
      });
      expect(compiled.code).toContain('@lowcode-platform/preset-test/runtime');
      expect(compiled.code).toContain('第二个按钮');
    });

    it('rejects antd-only types and aliases (structurally valid nodes, pure profile gate)', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-patch-r', schema: B4_TEST_PAGE_SCHEMA });
      // 对照组：同组合下已存在的 antd 页面
      await repo.saveSchema({
        pageId: 'antd-patch',
        schema: ANT_PAGE_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
      });

      const previewTool = graph.toolRegistry.get('preview_patch')!;

      const ctx = await graph.toolService.createExecutionContext(
        { pageId: 'b4-patch-r' },
        'trace-patch-b4-r',
      );

      // 拒绝：AntD 别名 Btn 在 test 页面不可解析（结构合法，纯 Profile gate 命中）
      await expect(
        previewTool.execute(
          {
            patch: [
              { op: 'insertComponent', parentId: 'root', component: { id: 'x1', type: 'Btn' } },
            ],
          },
          ctx as never,
        ),
      ).rejects.toThrow(AgentToolException);

      // 拒绝：AntD 独有类型 Input（结构合法），同一节点在 antd 页面被接受
      await expect(
        previewTool.execute(
          {
            patch: [
              {
                op: 'insertComponent',
                parentId: 'root',
                component: { id: 'x2', type: 'Input' },
              },
            ],
          },
          ctx as never,
        ),
      ).rejects.toThrow(AgentToolException);

      const antdCtx = await graph.toolService.createExecutionContext(
        { pageId: 'antd-patch' },
        'trace-patch-antd',
      );
      const antdAccepted = await previewTool.execute(
        {
          patch: [
            {
              op: 'insertComponent',
              parentId: 'root',
              component: { id: 'x2', type: 'Input' },
            },
          ],
        },
        antdCtx as never,
      );
      expect((antdAccepted.updatedWorkingSchema as PageSchema).components['x2']).toBeDefined();
    });

    it('rejects antd-only props on test pages at both insert and updateProps (per-preset boundary)', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-props', schema: B4_TEST_PAGE_SCHEMA });
      await repo.saveSchema({
        pageId: 'antd-props',
        schema: ANT_PAGE_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: ANTD_RUNTIME_COMPATIBILITY,
      });

      const previewTool = graph.toolRegistry.get('preview_patch')!;
      const ctx = await graph.toolService.createExecutionContext(
        { pageId: 'b4-props' },
        'trace-props-b4',
      );

      // 拒绝：insert 带 AntD 专属 Props（loading/danger 不在 builtin-test 白名单）
      await expect(
        previewTool.execute(
          {
            patch: [
              {
                op: 'insertComponent',
                parentId: 'root',
                component: {
                  id: 'cta-3',
                  type: 'Button',
                  props: { children: 'x', loading: true, danger: true },
                },
              },
            ],
          },
          ctx as never,
        ),
      ).rejects.toThrow(/Unsupported props \[loading, danger\]/);

      // 拒绝：updateProps 注入 AntD 专属 Prop
      await expect(
        previewTool.execute(
          {
            patch: [{ op: 'updateProps', componentId: 'cta', props: { danger: true } }],
          },
          ctx as never,
        ),
      ).rejects.toThrow(/Unsupported props \[danger\]/);

      // 边界按 Preset 生效：同一 Props 在未声明白名单的 AntD Meta 下不受限
      const antdCtx = await graph.toolService.createExecutionContext(
        { pageId: 'antd-props' },
        'trace-props-antd',
      );
      const antdAccepted = await previewTool.execute(
        {
          patch: [
            {
              op: 'updateProps',
              componentId: 'btn-1',
              props: { loading: true, danger: true },
            },
          ],
        },
        antdCtx as never,
      );
      expect(
        (antdAccepted.updatedWorkingSchema as PageSchema).components['btn-1']?.props?.loading,
      ).toBe(true);
    });

    it('alias inserts are canonicalized at write, in returned patches, and stay compile-safe on replay (review round 3)', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-alias', schema: B4_TEST_PAGE_SCHEMA });

      const previewTool = graph.toolRegistry.get('preview_patch')!;
      const ctx = await graph.toolService.createExecutionContext(
        { pageId: 'b4-alias' },
        'trace-alias',
      );
      // 别名 Action 在 Meta 解析层被接受，但写入的 Schema 一律规范化为 Button
      const accepted = await previewTool.execute(
        {
          patch: [
            {
              op: 'insertComponent',
              parentId: 'root',
              component: { id: 'alias-cta', type: 'Action', props: { children: '别名按钮' } },
            },
          ],
        },
        ctx as never,
      );
      const updated = accepted.updatedWorkingSchema as PageSchema;
      expect(updated.components['alias-cta']?.type).toBe('Button');

      // 对外返回的 Patch 必须同步规范化：客户端确认后重放的是这个 Patch，
      // 若仍是 Action，前端 applyPatchToSchema 会把别名写回 Schema
      const returnedPatch = (accepted.data as { patch: Array<{ component?: { type?: string } }> })
        .patch;
      expect(returnedPatch).toHaveLength(1);
      expect(returnedPatch[0]!.component?.type).toBe('Button');

      // 重放路径（等价于前端 applyPatchToSchema 的服务端实现）：结果与预览完全一致
      // （两侧都经 Contract 规范化后再比对，重放结果保存时也会走同一规范化）
      const replayed = graph.applyService.applyPatch(B4_TEST_PAGE_SCHEMA, returnedPatch as never);
      expect(replayed.components['alias-cta']?.type).toBe('Button');
      expect(requireSupportedPageSchema(replayed)).toEqual(updated);

      // 重放结果可保存、可编译——别名路径不再产生不可导出的页面
      const saved = await graph.pageService.saveSchema({
        pageId: 'b4-alias',
        schema: replayed,
        basePageVersion: 1,
      });
      expect(saved.pageVersion).toBe(2);

      const compiled = await graph.compilerService.compile({
        schema: replayed as unknown as Record<string, unknown>,
        options: { pageId: 'b4-alias', pageVersion: 2 },
      });
      expect(compiled.code).toContain('@lowcode-platform/preset-test/runtime');
      expect(compiled.code).toContain('别名按钮');
      // 产物中不存在别名 JSX 标签（规范化后只会有 Button）
      expect(compiled.code).not.toMatch(/<Action[\s/>]/);
    });
  });

  describe('Scenario 4: Agent 确认后经真实 CAS 保存', () => {
    it('patched schema saves with basePageVersion and keeps the test tuple; stale version conflicts', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-cas', schema: B4_TEST_PAGE_SCHEMA });

      const ctx = await graph.toolService.createExecutionContext({ pageId: 'b4-cas' }, 'trace-cas');
      const previewTool = graph.toolRegistry.get('preview_patch')!;
      const preview = await previewTool.execute(
        {
          patch: [
            {
              op: 'insertComponent',
              parentId: 'root',
              component: { id: 'cta-2', type: 'Button', props: { children: '第二个按钮' } },
            },
          ],
        },
        ctx as never,
      );

      const updated = preview.updatedWorkingSchema as PageSchema;
      const saved = await graph.pageService.saveSchema({
        pageId: 'b4-cas',
        schema: updated,
        basePageVersion: 1,
      });
      expect(saved.pageVersion).toBe(2);
      expect(repo.getLatestSnapshot('b4-cas')!.runtimeCompatibility).toEqual(
        TEST_RUNTIME_COMPATIBILITY,
      );

      await expect(
        graph.pageService.saveSchema({
          pageId: 'b4-cas',
          schema: updated,
          basePageVersion: 1, // 过期版本必须冲突
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Scenario 5: Compiler 真实导出（generator + 可解析模块路径）', () => {
    it('emits preset-test runtime imports that actually resolve with named exports', async () => {
      const graph = createServiceGraph(acceptanceRegistry, repo);
      await graph.pageService.saveSchema({ pageId: 'b4-compile', schema: B4_TEST_PAGE_SCHEMA });

      const result = await graph.compilerService.compile({
        schema: B4_TEST_PAGE_SCHEMA as unknown as Record<string, unknown>,
        options: { pageId: 'b4-compile', pageVersion: 1 },
      });

      expect(result.code).toMatch(
        /import \{[^}]*Button[^}]*\} from "@lowcode-platform\/preset-test\/runtime";/,
      );
      expect(result.code).toContain('from "@lowcode-platform/preset-test/runtime"');
      // 禁止虚构库或串用 antd
      expect(result.code).not.toContain('lib-b');
      expect(result.code).not.toContain('@lowcode-platform/preset-antd');

      // 生成代码的导入模块在消费者（backend）内实际可解析，且绑定类型都是命名导出
      const composition = getDeploymentComposition('b4-acceptance');
      const bindings = composition.compilerBindings[
        'builtin-test-compiler-bindings-0.1.0'
      ] as CompilerBindings;
      for (const type of Object.keys(bindings.componentBindings ?? {})) {
        if (typeof presetTestRuntimeModule[type] !== 'function') {
          throw new Error(`runtime export missing for bound component type: ${type}`);
        }
      }
      // generator 的 feedback 动作从 defaultLibrary 导入 message
      expect(typeof presetTestRuntimeModule['message']).toBe('object');
    });

    it('rejects compile when the page tuple does not resolve (version mismatch)', async () => {
      await repo.saveSchema({
        pageId: 'b4-compile-mismatch',
        schema: B4_TEST_PAGE_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: TEST_PRESET_ID,
          componentPresetVersion: '9.9.9',
          rendererVersion: '1.0.0',
        },
      });
      const graph = createServiceGraph(acceptanceRegistry, repo);

      await expect(
        graph.compilerService.compile({
          schema: B4_TEST_PAGE_SCHEMA as unknown as Record<string, unknown>,
          options: { pageId: 'b4-compile-mismatch', pageVersion: 1 },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Scenario 6: A→B 静态升级（同 systemId，重启换组合）', () => {
    it('legacy antd pages stay antd across save/preview/agent/compile while new pages bind test', async () => {
      // 阶段 A：正常部署（default 组合）创建 antd 页面
      const defaultGraph = createServiceGraph(createRegistryForComposition('default'), repo);
      await defaultGraph.pageService.saveSchema({
        pageId: 'page-legacy',
        schema: ANT_PAGE_SCHEMA,
      });
      expect(repo.getLatestSnapshot('page-legacy')!.runtimeCompatibility).toEqual(
        ANTD_RUNTIME_COMPATIBILITY,
      );

      // 阶段 B：以 b4-acceptance 组合“重启”（共享同一存储）
      const graph = createServiceGraph(acceptanceRegistry, repo);

      // 旧页面保存仍为 antd（deprecated 允许）
      const v2 = await graph.pageService.saveSchema({
        pageId: 'page-legacy',
        schema: ANT_PAGE_SCHEMA,
        basePageVersion: 1,
      });
      expect(v2.pageVersion).toBe(2);
      expect(repo.getLatestSnapshot('page-legacy')!.runtimeCompatibility).toEqual(
        ANTD_RUNTIME_COMPATIBILITY,
      );

      // 新页面绑定 test
      await graph.pageService.saveSchema({ pageId: 'page-new', schema: B4_TEST_PAGE_SCHEMA });
      expect(repo.getLatestSnapshot('page-new')!.runtimeCompatibility).toEqual(
        TEST_RUNTIME_COMPATIBILITY,
      );

      // 旧页面预览身份不变
      const resolved = await graph.schemaResolver.resolveWithCompatibility({
        pageId: 'page-legacy',
      });
      expect(resolved.runtimeCompatibility).toEqual(ANTD_RUNTIME_COMPATIBILITY);

      // 旧页面 Agent 仍读 antd Meta/别名
      const legacyCtx = await graph.toolService.createExecutionContext(
        { pageId: 'page-legacy' },
        'trace-legacy',
      );
      expect(legacyCtx.runtimeCompatibility).toEqual(ANTD_RUNTIME_COMPATIBILITY);
      const legacyMeta = await graph.toolService.executeTool(
        'get_component_meta',
        { type: 'Btn' },
        legacyCtx,
      );
      expect(
        (legacyMeta.data as { component?: { displayName?: string } }).component?.displayName,
      ).toBe('按钮');
      const legacyCrossAlias = await graph.toolService.executeTool(
        'get_component_meta',
        { type: 'Action' },
        legacyCtx,
      );
      expect(
        (legacyCrossAlias.data as { component?: { displayName?: string } }).component,
      ).toBeUndefined();

      // 旧页面编译仍来自 antd runtime
      const compiled = await graph.compilerService.compile({
        schema: ANT_PAGE_SCHEMA as unknown as Record<string, unknown>,
        options: { pageId: 'page-legacy', pageVersion: 2 },
      });
      expect(compiled.code).toContain('@lowcode-platform/preset-antd/runtime');
      expect(compiled.code).not.toContain('@lowcode-platform/preset-test/runtime');
    });
  });

  describe('Scenario 7: 跨组合延续（test 页面回到正常部署仍可保存）', () => {
    it('a test-bound page created under acceptance keeps saving under the default composition', async () => {
      const acceptanceGraph = createServiceGraph(acceptanceRegistry, repo);
      await acceptanceGraph.pageService.saveSchema({
        pageId: 'b4-cross',
        schema: B4_TEST_PAGE_SCHEMA,
      });

      // 正常部署（test deprecated）：已有绑定允许保存，Meta 仍可精确解析
      const defaultGraph = createServiceGraph(createRegistryForComposition('default'), repo);
      const saved = await defaultGraph.pageService.saveSchema({
        pageId: 'b4-cross',
        schema: B4_TEST_PAGE_SCHEMA,
        basePageVersion: 1,
      });
      expect(saved.pageVersion).toBe(2);
      expect(repo.getLatestSnapshot('b4-cross')!.runtimeCompatibility).toEqual(
        TEST_RUNTIME_COMPATIBILITY,
      );
      expect(
        createRegistryForComposition('default')
          .resolveComponentMeta(TEST_RUNTIME_COMPATIBILITY)
          .resolve('Action')?.type,
      ).toBe('Button');
    });
  });

  describe('Scenario 8: A/B 交错：Meta/别名与编译来源不串用', () => {
    it('resolves distinct metas, aliases and compiler sources for interleaved tuples', () => {
      const testMeta = acceptanceRegistry.resolveComponentMeta(TEST_RUNTIME_COMPATIBILITY);
      const antdMeta = acceptanceRegistry.resolveComponentMeta(ANTD_RUNTIME_COMPATIBILITY);

      expect(testMeta.resolve('Action')?.displayName).toBe('测试按钮');
      expect(testMeta.resolve('Btn')).toBeUndefined();
      expect(antdMeta.resolve('Btn')?.displayName).toBe('按钮');
      expect(antdMeta.resolve('Action')).toBeUndefined();

      // 同名 Button：displayName 与编译来源都不同
      expect(testMeta.resolve('Button')?.displayName).not.toBe(
        antdMeta.resolve('Button')?.displayName,
      );

      const testBindings = acceptanceRegistry.resolveCompilerBindings(TEST_RUNTIME_COMPATIBILITY);
      const antdBindings = acceptanceRegistry.resolveCompilerBindings(ANTD_RUNTIME_COMPATIBILITY);
      expect(testBindings.componentBindings?.['Button']?.module).toBe(
        '@lowcode-platform/preset-test/runtime',
      );
      expect(antdBindings.componentBindings?.['Button']?.module).toBe(
        '@lowcode-platform/preset-antd/runtime',
      );

      // 交错重复查询无全局污染
      expect(testMeta.resolve('Action')?.displayName).toBe('测试按钮');
      expect(antdMeta.resolve('Btn')?.displayName).toBe('按钮');
    });
  });

  describe('Scenario 9: disabled / unknown / mismatch 拒绝矩阵', () => {
    it('unknown preset tuple is refused by save, compiler and agent execution', async () => {
      await repo.saveSchema({
        pageId: 'page-unknown',
        schema: B4_TEST_PAGE_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'builtin-unknown',
          componentPresetVersion: '0.0.1',
          rendererVersion: '1.0.0',
        },
      });
      const graph = createServiceGraph(acceptanceRegistry, repo);

      await expect(
        graph.pageService.saveSchema({
          pageId: 'page-unknown',
          schema: B4_TEST_PAGE_SCHEMA,
          basePageVersion: 1,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        graph.compilerService.compile({
          schema: B4_TEST_PAGE_SCHEMA as unknown as Record<string, unknown>,
          options: { pageId: 'page-unknown', pageVersion: 1 },
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        graph.toolService.createExecutionContext({ pageId: 'page-unknown' }, 'trace-unknown'),
      ).rejects.toThrow(AgentToolException);
    });

    it('disabled test preset refuses further saves for already-bound pages', async () => {
      const composition = getDeploymentComposition('b4-acceptance');
      const disabledTestRegistry = new DeploymentRuntimeProfileRegistry(
        composition.profiles.map((profile) =>
          profile.componentPresetId === TEST_PRESET_ID
            ? { ...profile, status: 'disabled' }
            : profile,
        ),
        composition.compilerBindings,
        composition.componentMetas,
      );
      await repo.saveSchema({
        pageId: 'b4-disabled',
        schema: B4_TEST_PAGE_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: TEST_RUNTIME_COMPATIBILITY,
      });

      const graph = createServiceGraph(disabledTestRegistry, repo);
      await expect(
        graph.pageService.saveSchema({
          pageId: 'b4-disabled',
          schema: B4_TEST_PAGE_SCHEMA,
          basePageVersion: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
  describe('Scenario 10: 真实生产仓储（文件存储）下的 CAS 与持久化', () => {
    let tmpDir: string;
    let storePath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-real-repo-test-'));
      storePath = path.join(tmpDir, 'store.json');
      (
        PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
      ).writeTails?.clear?.();
    });

    afterEach(() => {
      (
        PageSchemaRepository as unknown as { writeTails: Map<string, Promise<void>> }
      ).writeTails?.clear?.();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function createRealRepo(p = storePath): PageSchemaRepository {
      const realRepo = new PageSchemaRepository();
      (realRepo as unknown as { storeFilePath: string }).storeFilePath = p;
      return realRepo;
    }

    it('first save binds the test tuple, CAS bumps versions, stale basePageVersion conflicts, and state survives a repository restart', async () => {
      const realRepo = createRealRepo();
      await realRepo.onModuleInit();
      const graph = createServiceGraph(acceptanceRegistry, realRepo);

      const v1 = await graph.pageService.saveSchema({
        pageId: 'b4-real-cas',
        schema: B4_TEST_PAGE_SCHEMA,
      });
      expect(v1.pageVersion).toBe(1);

      const v2 = await graph.pageService.saveSchema({
        pageId: 'b4-real-cas',
        schema: B4_TEST_PAGE_SCHEMA,
        basePageVersion: 1,
      });
      expect(v2.pageVersion).toBe(2);

      await expect(
        graph.pageService.saveSchema({
          pageId: 'b4-real-cas',
          schema: B4_TEST_PAGE_SCHEMA,
          basePageVersion: 1,
        }),
      ).rejects.toThrow(ConflictException);

      // “重启”：用同一存储文件构建新的真实仓储与服务图，快照三元组持久保留
      const restartedRepo = createRealRepo();
      await restartedRepo.onModuleInit();
      const restartedGraph = createServiceGraph(acceptanceRegistry, restartedRepo);
      const reloaded = await restartedGraph.pageService.getSchema('b4-real-cas');
      expect(reloaded.pageVersion).toBe(2);
      expect(reloaded.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);

      const v3 = await restartedGraph.pageService.saveSchema({
        pageId: 'b4-real-cas',
        schema: B4_TEST_PAGE_SCHEMA,
        basePageVersion: 2,
      });
      expect(v3.pageVersion).toBe(3);
    });
  });
});
