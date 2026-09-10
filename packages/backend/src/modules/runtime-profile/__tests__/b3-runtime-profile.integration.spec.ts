import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
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
import type { SystemRuntimeProfile } from '../../page-schema/system-runtime-profile';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { SchemaResolverService } from '../../schema-context/schema-resolver.service';
import { CompilerService } from '../../compiler/compiler.service';
import { ToolExecutionService } from '../../agent-tools/tool-execution.service';
import { AgentToolException } from '../../agent-tools/agent-tool.exception';
import { PatchApplyService } from '../../agent-tools/patch-apply.service';
import { PatchAutoFixService } from '../../agent-tools/patch-auto-fix.service';
import { PatchValidationService } from '../../agent-tools/patch-validation.service';
import { ToolRegistryService } from '../../agent-tools/tool-registry.service';
import { createInternalDefinitions } from '../../agent-tools/definitions/internal.tools';
import { buildCollectionContainerClarification } from '../../agent/agent-batch.planner';
import { ContextAssemblerService } from '../../schema-context/context-assembler.service';
import { SchemaSlicerService } from '../../schema-context/schema-slicer.service';
import { NodeLocatorService } from '../../schema-context/node-locator.service';

const TEST_SCHEMA: PageSchema = Object.freeze({
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['button-1'] },
    'button-1': { id: 'button-1', type: 'Button', props: { children: '点击' } },
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

describe('B3 Runtime Profile Integration Matrix (Issue #39)', () => {
  const profileA: SystemRuntimeProfile = {
    systemId: 'default',
    componentPresetId: 'preset-a',
    componentPresetVersion: '1.0.0',
    rendererVersion: '1.0.0',
    compilerBindingId: 'bindings-a',
    status: 'deprecated',
  };

  const profileB: SystemRuntimeProfile = {
    systemId: 'default',
    componentPresetId: 'preset-b',
    componentPresetVersion: '2.0.0',
    rendererVersion: '1.0.0',
    compilerBindingId: 'bindings-b',
    status: 'active',
  };

  const disabledProfile: SystemRuntimeProfile = {
    systemId: 'default',
    componentPresetId: 'preset-disabled',
    componentPresetVersion: '0.0.1',
    rendererVersion: '1.0.0',
    compilerBindingId: 'bindings-disabled',
    status: 'disabled',
  };

  const bindingsA: CompilerBindings = {
    defaultLibrary: 'lib-a',
    componentSources: { Button: 'lib-a/button', Page: 'lib-a/page' },
    allowDefaultComponentFallback: false,
  };

  const bindingsB: CompilerBindings = {
    defaultLibrary: 'lib-b',
    componentSources: { Button: 'lib-b/button', Page: 'lib-b/page' },
    allowDefaultComponentFallback: false,
  };

  const metaA = new ComponentMetaRegistry(
    [
      {
        type: 'Button',
        displayName: '按钮 A',
        isContainer: false,
        textProps: ['children'],
        category: 'other',
        properties: [],
      },
    ],
    new Map([['BtnA', 'Button']]),
  );

  const metaB = new ComponentMetaRegistry(
    [
      {
        type: 'Button',
        displayName: '按钮 B',
        isContainer: false,
        textProps: ['children'],
        category: 'other',
        properties: [],
      },
    ],
    new Map([['BtnB', 'Button']]),
  );

  let customDeploymentRegistry: DeploymentRuntimeProfileRegistry;
  let customMetadataProvider: PageRuntimeMetadataProvider;

  beforeEach(() => {
    customDeploymentRegistry = new DeploymentRuntimeProfileRegistry(
      [profileA, profileB, disabledProfile],
      {
        'bindings-a': bindingsA,
        'bindings-b': bindingsB,
        'bindings-disabled': bindingsA,
      },
      {
        'preset-a@1.0.0': metaA,
        'preset-b@2.0.0': metaB,
        'preset-disabled@0.0.1': metaA,
      },
    );
    customMetadataProvider = new PageRuntimeMetadataProvider(customDeploymentRegistry);
  });

  describe('Scenario 1: 新页面、唯一 active 绑定', () => {
    it('selects active profile, stores exact tuple in snapshot, and schema has no version/system/bindings metadata', async () => {
      const repo = createInMemoryRepository();
      const pageService = new PageSchemaService(repo, customMetadataProvider);

      const saved = await pageService.saveSchema({
        pageId: 'new-page-1',
        schema: TEST_SCHEMA,
      });

      expect(saved.pageVersion).toBe(1);
      const snapshot = repo.getLatestSnapshot('new-page-1');
      expect(snapshot).toBeDefined();
      expect(snapshot!.runtimeCompatibility).toEqual({
        componentPresetId: 'preset-b',
        componentPresetVersion: '2.0.0',
        rendererVersion: '1.0.0',
      });
      // Schema 纯数据断言
      expect(snapshot!.schema.schemaVersion).toBe(0);
      const rawSchema = snapshot!.schema as unknown as Record<string, unknown>;
      expect(rawSchema.pageVersion).toBeUndefined();
      expect(rawSchema.systemId).toBeUndefined();
      expect(rawSchema.compilerBindingId).toBeUndefined();
      expect(rawSchema.runtimeCompatibility).toBeUndefined();
    });
  });

  describe('Scenario 2: 客户端伪造参数被服务端忽略或隔离', () => {
    it('ignores client-supplied systemId/runtimeCompatibility/compilerBindingId and uses server-resolved profile', async () => {
      const repo = createInMemoryRepository();
      const pageService = new PageSchemaService(repo, customMetadataProvider);

      const forgedInput = {
        pageId: 'forged-page',
        schema: TEST_SCHEMA,
        systemId: 'attacker-system',
        runtimeCompatibility: {
          componentPresetId: 'attacker-preset',
          componentPresetVersion: '9.9.9',
          rendererVersion: '9.9.9',
        },
        compilerBindingId: 'attacker-bindings',
      };

      const saved = await pageService.saveSchema(
        forgedInput as unknown as { pageId: string; schema: PageSchema },
      );
      expect(saved.pageVersion).toBe(1);

      const snapshot = repo.getLatestSnapshot('forged-page');
      expect(snapshot!.runtimeCompatibility.componentPresetId).toBe('preset-b');
      expect(snapshot!.runtimeCompatibility.componentPresetVersion).toBe('2.0.0');
      expect(repo.getPage('forged-page')!.systemId).toBe('default');
    });
  });

  describe('Scenario 3: 已有页面 A，当前系统已升级为 B 时，已有页面保存继续保持 A', () => {
    it('saves new snapshot of existing page with original bound profile A, without upgrading to B', async () => {
      const repo = createInMemoryRepository();
      // 预先写入 Page 1 绑定在 Profile A
      await repo.saveSchema({
        pageId: 'page-1',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);

      // 保存 Page 1 的新版本 (v1 -> v2)
      const v2 = await pageService.saveSchema({
        pageId: 'page-1',
        schema: TEST_SCHEMA,
        basePageVersion: 1,
      });
      expect(v2.pageVersion).toBe(2);

      const snapV2 = repo.getLatestSnapshot('page-1');
      expect(snapV2!.runtimeCompatibility).toEqual({
        componentPresetId: 'preset-a',
        componentPresetVersion: '1.0.0',
        rendererVersion: '1.0.0',
      });

      // 同时新页面正常绑定当前 active 的 Profile B
      await pageService.saveSchema({
        pageId: 'page-2',
        schema: TEST_SCHEMA,
      });
      expect(repo.getLatestSnapshot('page-2')!.runtimeCompatibility.componentPresetId).toBe(
        'preset-b',
      );
    });
  });

  describe('Scenario 4: deprecated Profile 生命周期规则', () => {
    it('forbids new page binding with deprecated profile', () => {
      const allDeprecatedRegistry = new DeploymentRuntimeProfileRegistry(
        [{ ...profileA, status: 'deprecated' }],
        { 'bindings-a': bindingsA },
      );
      const provider = new PageRuntimeMetadataProvider(allDeprecatedRegistry);
      expect(() => provider.resolveSystemRuntimeMetadata('default')).toThrow(BadRequestException);
    });

    it('allows existing page with deprecated profile to save new snapshots retaining the triplet', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'legacy-page',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const res = await pageService.saveSchema({
        pageId: 'legacy-page',
        schema: TEST_SCHEMA,
        basePageVersion: 1,
      });

      expect(res.pageVersion).toBe(2);
      expect(repo.getLatestSnapshot('legacy-page')!.runtimeCompatibility.componentPresetId).toBe(
        'preset-a',
      );
    });
  });

  describe('Scenario 5: disabled / unknown / mismatch 拒绝策略', () => {
    it('refuses saveSchema on existing page bound to disabled profile', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'disabled-page',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-disabled',
          componentPresetVersion: '0.0.1',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      await expect(
        pageService.saveSchema({
          pageId: 'disabled-page',
          schema: TEST_SCHEMA,
          basePageVersion: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses CompilerService on disabled or mismatched profile', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'disabled-page',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-disabled',
          componentPresetVersion: '0.0.1',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const compilerService = new CompilerService(pageService, customDeploymentRegistry);

      await expect(
        compilerService.compile({
          schema: TEST_SCHEMA as unknown as Record<string, unknown>,
          options: { pageId: 'disabled-page', pageVersion: 1 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses ToolExecutionService execution context creation for disabled profile', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'disabled-page',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-disabled',
          componentPresetVersion: '0.0.1',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const toolService = new ToolExecutionService(
        pageService,
        {} as unknown as ContextAssemblerService,
        {} as unknown as ToolRegistryService,
        customDeploymentRegistry,
      );

      await expect(
        toolService.createExecutionContext({ pageId: 'disabled-page' }, 'trace-disabled'),
      ).rejects.toThrow(AgentToolException);

      try {
        await toolService.createExecutionContext({ pageId: 'disabled-page' }, 'trace-disabled');
      } catch (err: unknown) {
        expect((err as AgentToolException).getResponse()).toMatchObject({
          code: 'PATCH_INVALID',
        });
      }
    });
  });

  describe('Scenario 6: 已有 pageId + draftSchema 组合', () => {
    it('uses draftSchema content while retaining pageId bound runtime profile', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'page-bound-a',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const schemaResolver = new SchemaResolverService(pageService, customDeploymentRegistry);

      const modifiedDraft: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['button-1'] },
          'button-1': { id: 'button-1', type: 'Button', props: { children: '草稿修改文案' } },
        },
      };

      const resolved = await schemaResolver.resolveWithCompatibility({
        pageId: 'page-bound-a',
        draftSchema: modifiedDraft as unknown as Record<string, unknown>,
      });

      expect(resolved.schema.components['button-1'].props?.children).toBe('草稿修改文案');
      expect(resolved.runtimeCompatibility).toEqual({
        componentPresetId: 'preset-a',
        componentPresetVersion: '1.0.0',
        rendererVersion: '1.0.0',
      });
    });

    it('fails close when pageId does not exist, never falling back to default draft', async () => {
      const repo = createInMemoryRepository();
      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const schemaResolver = new SchemaResolverService(pageService, customDeploymentRegistry);

      await expect(
        schemaResolver.resolveWithCompatibility({
          pageId: 'non-existent-page',
          draftSchema: TEST_SCHEMA as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Scenario 7: Agent A/B 交错多快照并发无全局串用', () => {
    it('resolves distinct component metas and aliases for interleaved request contexts without global mutation', () => {
      const compatibilityA: RuntimeCompatibility = {
        componentPresetId: 'preset-a',
        componentPresetVersion: '1.0.0',
        rendererVersion: '1.0.0',
      };
      const compatibilityB: RuntimeCompatibility = {
        componentPresetId: 'preset-b',
        componentPresetVersion: '2.0.0',
        rendererVersion: '1.0.0',
      };

      // 模拟两个单进程内交错的请求上下文
      const registryA = customDeploymentRegistry.resolveComponentMeta(compatibilityA);
      const registryB = customDeploymentRegistry.resolveComponentMeta(compatibilityB);

      // Context A 应识别 BtnA，无法识别 BtnB
      expect(registryA.resolve('BtnA')).toBeDefined();
      expect(registryA.resolve('BtnA')?.displayName).toBe('按钮 A');
      expect(registryA.resolve('BtnB')).toBeUndefined();

      // Context B 应识别 BtnB，无法识别 BtnA
      expect(registryB.resolve('BtnB')).toBeDefined();
      expect(registryB.resolve('BtnB')?.displayName).toBe('按钮 B');
      expect(registryB.resolve('BtnA')).toBeUndefined();

      // 交错再次查询，保证没有任何全局缓存或单例污染
      expect(registryA.resolve('BtnA')?.displayName).toBe('按钮 A');
      expect(registryB.resolve('BtnB')?.displayName).toBe('按钮 B');
    });
  });

  describe('Scenario 10: Compiler 历史版本绑定代码生成验证', () => {
    it('generates imports from bound preset compiler bindings (lib-a vs lib-b)', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'page-a',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      });

      await repo.saveSchema({
        pageId: 'page-b',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-b',
          componentPresetVersion: '2.0.0',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const compilerService = new CompilerService(pageService, customDeploymentRegistry);

      const codeA = await compilerService.compile({
        schema: TEST_SCHEMA as unknown as Record<string, unknown>,
        options: { pageId: 'page-a', pageVersion: 1 },
      });
      const codeB = await compilerService.compile({
        schema: TEST_SCHEMA as unknown as Record<string, unknown>,
        options: { pageId: 'page-b', pageVersion: 1 },
      });

      // 验证 bindings-a 使用 lib-a，bindings-b 使用 lib-b
      expect(codeA.code).toContain('lib-a');
      expect(codeA.code).not.toContain('lib-b');

      expect(codeB.code).toContain('lib-b');
      expect(codeB.code).not.toContain('lib-a');
    });
  });

  describe('Scenario 4b: Meta 精确版本，缺失即拒绝', () => {
    it('rejects resolveComponentMeta when only unversioned preset key is registered', () => {
      const metaFallback = new ComponentMetaRegistry(
        [
          {
            type: 'Button',
            displayName: '默认按钮',
            isContainer: false,
            textProps: ['children'],
            category: 'other',
            properties: [],
          },
        ],
        new Map([['BtnDefault', 'Button']]),
      );

      const registry = new DeploymentRuntimeProfileRegistry(
        [
          {
            systemId: 'default',
            componentPresetId: 'builtin-antd',
            componentPresetVersion: '9.9.9',
            rendererVersion: '1.0.0',
            compilerBindingId: 'bindings-a',
            status: 'active',
          },
        ],
        { 'bindings-a': bindingsA },
        {
          // 只注册未版本化键，模拟历史 fallback 来源
          'builtin-antd': metaFallback,
        },
      );

      expect(() =>
        registry.resolveComponentMeta({
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '9.9.9',
          rendererVersion: '1.0.0',
        }),
      ).toThrow(BadRequestException);

      // 精确版本键存在时允许
      const exactRegistry = new DeploymentRuntimeProfileRegistry(
        [
          {
            systemId: 'default',
            componentPresetId: 'builtin-antd',
            componentPresetVersion: '9.9.9',
            rendererVersion: '1.0.0',
            compilerBindingId: 'bindings-a',
            status: 'active',
          },
        ],
        { 'bindings-a': bindingsA },
        {
          'builtin-antd@9.9.9': metaFallback,
        },
      );
      expect(
        exactRegistry
          .resolveComponentMeta({
            componentPresetId: 'builtin-antd',
            componentPresetVersion: '9.9.9',
            rendererVersion: '1.0.0',
          })
          .resolve('BtnDefault'),
      ).toBeDefined();
    });
  });

  describe('Scenario 3b: preview_patch 走真实工具链并使用 context.runtimeCompatibility', () => {
    function createInternalToolPreview(customRegistry: DeploymentRuntimeProfileRegistry) {
      const applyService = new PatchApplyService();
      const validationService = new PatchValidationService(
        new ComponentMetaRegistry(),
        applyService,
        customRegistry,
      );
      const autoFixService = new PatchAutoFixService();
      const tools = createInternalDefinitions({
        patchAutoFixService: autoFixService,
        patchValidationService: validationService,
      });
      const previewTool = tools.find((t) => t.name === 'preview_patch');
      expect(previewTool).toBeDefined();
      return previewTool!;
    }

    it('accepts BtnA insert under profile A and rejects it under profile B', async () => {
      const previewTool = createInternalToolPreview(customDeploymentRegistry);

      const baseSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: [] },
        },
      } as unknown as PageSchema;

      const patch = [
        {
          op: 'insertComponent',
          parentId: 'root',
          component: { id: 'btn-a-1', type: 'BtnA' },
        },
      ];

      const contextA = {
        workingSchema: baseSchema,
        accumulatedPatch: [],
        warnings: [],
        traceId: 'trace-preview-a',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      };

      const resultA = await previewTool.execute({ patch }, contextA as never);
      expect(resultA.updatedWorkingSchema).toBeDefined();
      expect((resultA.updatedWorkingSchema as PageSchema).components['btn-a-1']?.type).toBe('BtnA');

      const contextB = {
        workingSchema: baseSchema,
        accumulatedPatch: [],
        warnings: [],
        traceId: 'trace-preview-b',
        runtimeCompatibility: {
          componentPresetId: 'preset-b',
          componentPresetVersion: '2.0.0',
          rendererVersion: '1.0.0',
        },
      };

      await expect(previewTool.execute({ patch }, contextB as never)).rejects.toThrow(
        AgentToolException,
      );
      try {
        await previewTool.execute({ patch }, contextB as never);
      } catch (err: unknown) {
        expect((err as AgentToolException).getResponse()).toMatchObject({
          code: 'PATCH_INVALID',
          message: expect.stringContaining('BtnA'),
        });
      }
    });
  });

  describe('Scenario 15: 批处理容器判断与重验使用页面 Meta', () => {
    const containerAwareProfiles: SystemRuntimeProfile[] = [
      {
        systemId: 'default',
        componentPresetId: 'preset-a',
        componentPresetVersion: '1.0.0',
        rendererVersion: '1.0.0',
        compilerBindingId: 'bindings-a',
        status: 'deprecated',
      },
      {
        systemId: 'default',
        componentPresetId: 'preset-b',
        componentPresetVersion: '2.0.0',
        rendererVersion: '1.0.0',
        compilerBindingId: 'bindings-b',
        status: 'active',
      },
    ];

    // A：Div 是容器；B：Div 不是容器
    const metaDivContainer = new ComponentMetaRegistry(
      [
        {
          type: 'Page',
          displayName: '页面',
          isContainer: true,
          textProps: ['children'],
          category: 'layout',
          properties: [],
        },
        {
          type: 'Div',
          displayName: '布局 A',
          isContainer: true,
          textProps: ['children'],
          category: 'layout',
          properties: [],
        },
        {
          type: 'Button',
          displayName: '按钮 A',
          isContainer: false,
          textProps: ['children'],
          category: 'other',
          properties: [],
        },
      ],
      new Map(),
    );

    const metaDivLeaf = new ComponentMetaRegistry(
      [
        {
          type: 'Page',
          displayName: '页面',
          isContainer: true,
          textProps: ['children'],
          category: 'layout',
          properties: [],
        },
        {
          type: 'Div',
          displayName: '叶子 B',
          isContainer: false,
          textProps: ['children'],
          category: 'other',
          properties: [],
        },
        {
          type: 'Button',
          displayName: '按钮 B',
          isContainer: false,
          textProps: ['children'],
          category: 'other',
          properties: [],
        },
      ],
      new Map(),
    );

    it('buildCollectionContainerClarification uses page-bound Meta for isContainer', () => {
      const registry = new DeploymentRuntimeProfileRegistry(
        containerAwareProfiles,
        { 'bindings-a': bindingsA, 'bindings-b': bindingsB },
        {
          'preset-a@1.0.0': metaDivContainer,
          'preset-b@2.0.0': metaDivLeaf,
        },
      );

      const schema = {
        schemaVersion: 0,
        rootId: 'div-root',
        components: {
          'div-root': { id: 'div-root', type: 'Div', childrenIds: ['btn-1'] },
          'btn-1': { id: 'btn-1', type: 'Button', props: { children: 'x' } },
        },
      } as unknown as PageSchema;

      const host = {
        resolveMetaRegistry: (ctx: { runtimeCompatibility: RuntimeCompatibility }) =>
          registry.resolveComponentMeta(ctx.runtimeCompatibility),
      };

      const dto = { selectedId: 'div-root', instruction: '批量修改按钮' } as never;

      // Profile A：Div 是容器 → 放行
      const contextA = {
        workingSchema: schema,
        accumulatedPatch: [],
        warnings: [],
        traceId: 'trace-batch-a',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      };
      expect(
        buildCollectionContainerClarification(host, dto, contextA as never, 'trace-batch-a'),
      ).toBeUndefined();

      // Profile B：Div 不是容器 → 必须澄清，证明读取的是页面 Meta 而非全局默认
      const contextB = {
        workingSchema: schema,
        accumulatedPatch: [],
        warnings: [],
        traceId: 'trace-batch-b',
        runtimeCompatibility: {
          componentPresetId: 'preset-b',
          componentPresetVersion: '2.0.0',
          rendererVersion: '1.0.0',
        },
      };
      const clarification = buildCollectionContainerClarification(
        host,
        dto,
        contextB as never,
        'trace-batch-b',
      );
      expect(clarification).toBeDefined();
      expect(clarification!.mode).toBe('clarification');
      expect(clarification!.content).toContain('不是容器');
    });
  });

  describe('Scenario 16: Agent 完整工具链 A/B 交错', () => {
    function createToolChain(customRegistry: DeploymentRuntimeProfileRegistry) {
      const applyService = new PatchApplyService();
      const validationService = new PatchValidationService(
        new ComponentMetaRegistry(),
        applyService,
        customRegistry,
      );
      const autoFixService = new PatchAutoFixService();
      const collectionResolver = {
        resolve: jest.fn(),
      };
      const contextAssembler = new ContextAssemblerService(
        { resolve: jest.fn(), resolveWithCompatibility: jest.fn() } as never,
        new NodeLocatorService(new ComponentMetaRegistry()),
        new SchemaSlicerService(),
        new ComponentMetaRegistry(),
        customRegistry,
      );
      const toolRegistry = new ToolRegistryService(
        contextAssembler,
        new ComponentMetaRegistry(),
        collectionResolver as never,
        autoFixService,
        validationService,
        customRegistry,
      );
      return { toolRegistry, validationService, applyService };
    }

    it('interleaved createExecutionContext + get_component_meta keep A/B Meta isolated', async () => {
      const repo = createInMemoryRepository();
      await repo.saveSchema({
        pageId: 'agent-page-a',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-a',
          componentPresetVersion: '1.0.0',
          rendererVersion: '1.0.0',
        },
      });
      await repo.saveSchema({
        pageId: 'agent-page-b',
        schema: TEST_SCHEMA,
        systemId: 'default',
        runtimeCompatibility: {
          componentPresetId: 'preset-b',
          componentPresetVersion: '2.0.0',
          rendererVersion: '1.0.0',
        },
      });

      const pageService = new PageSchemaService(repo, customMetadataProvider);
      const { toolRegistry } = createToolChain(customDeploymentRegistry);
      const toolService = new ToolExecutionService(
        pageService,
        {} as unknown as ContextAssemblerService,
        toolRegistry,
        customDeploymentRegistry,
      );

      const [ctxA, ctxB] = await Promise.all([
        toolService.createExecutionContext({ pageId: 'agent-page-a' }, 'trace-agent-a'),
        toolService.createExecutionContext({ pageId: 'agent-page-b' }, 'trace-agent-b'),
      ]);

      expect(ctxA.runtimeCompatibility.componentPresetId).toBe('preset-a');
      expect(ctxB.runtimeCompatibility.componentPresetId).toBe('preset-b');

      const [metaA, metaB] = await Promise.all([
        toolService.executeTool('get_component_meta', { type: 'Button' }, ctxA),
        toolService.executeTool('get_component_meta', { type: 'Button' }, ctxB),
      ]);

      const displayA = (metaA.data as { component?: { displayName?: string } }).component
        ?.displayName;
      const displayB = (metaB.data as { component?: { displayName?: string } }).component
        ?.displayName;
      expect(displayA).toBe('按钮 A');
      expect(displayB).toBe('按钮 B');
      expect(displayA).not.toBe(displayB);

      // 交错再次读取，确认无全局串用
      const againA = await toolService.executeTool('get_component_meta', { type: 'Button' }, ctxA);
      expect((againA.data as { component?: { displayName?: string } }).component?.displayName).toBe(
        '按钮 A',
      );
    });
  });
});
