import * as path from 'path';
import * as contract from '@lowcode-platform/schema-contract';
import { ContextAssemblerService } from '../../schema-context';
import { CollectionTargetResolverService } from '../../schema-context/collection-target-resolver.service';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { AgentToolException } from '../agent-tool.exception';
import { PatchApplyService } from '../patch-apply.service';
import { PatchAutoFixService } from '../patch-auto-fix.service';
import { PatchValidationService } from '../patch-validation.service';
import { ToolExecutionService } from '../tool-execution.service';
import { ToolRegistryService } from '../tool-registry.service';

const conformanceFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

async function withBlockedCapabilityAsync<T>(
  capability: 'page-state' | 'named-computed' | 'action-flow',
  surface: 'contract' | 'validator' | 'editor-agent' | 'renderer' | 'compiler' | 'storage',
  fn: () => Promise<T>,
): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({
      [capability]: { [surface]: { status: 'unsupported', revision: 1 } },
    }),
  });
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
  }
}

describe('Agent Tools Ingress Capability Gates (C3b / Issue #47)', () => {
  let service: ToolExecutionService;
  let pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema' | 'saveSchema'>;

  beforeEach(() => {
    pageSchemaServiceMock = {
      getSchema: jest.fn(),
      saveSchema: jest.fn(),
    };

    const contextAssemblerMock: Pick<ContextAssemblerService, 'assemble'> = {
      assemble: jest.fn(),
    };

    const metaRegistry = new ComponentMetaRegistry();
    const collectionTargetResolver = new CollectionTargetResolverService(metaRegistry);
    const patchApplyService = new PatchApplyService();
    const patchValidationService = new PatchValidationService(metaRegistry, patchApplyService);
    const patchAutoFixService = new PatchAutoFixService();
    const toolRegistry = new ToolRegistryService(
      contextAssemblerMock as ContextAssemblerService,
      metaRegistry,
      collectionTargetResolver,
      patchAutoFixService,
      patchValidationService,
    );

    service = new ToolExecutionService(
      pageSchemaServiceMock as PageSchemaService,
      contextAssemblerMock as ContextAssemblerService,
      toolRegistry,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('4. ToolExecutionService.previewPatch: draft 输入', () => {
    it('rejects blocked draft before patch execution; input draft remains unmodified and no save occurs', async () => {
      // 冻结输入对象以确保完全不被原地变异
      const draftSchema = contract.deepFreeze(
        JSON.parse(JSON.stringify(conformanceFixture.schema)),
      );
      const originalSnapshot = JSON.stringify(draftSchema);

      await withBlockedCapabilityAsync('page-state', 'editor-agent', async () => {
        let caughtError: unknown;
        try {
          await service.previewPatch(
            {
              draftSchema,
              patch: [
                {
                  op: 'updateProps',
                  componentId: 'change-price',
                  props: { children: 'Updated Button' },
                },
              ],
            },
            'trace-draft-blocked',
          );
        } catch (error) {
          caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(AgentToolException);
        const toolException = caughtError as AgentToolException;
        const response = toolException.getResponse() as {
          code: string;
          message: string;
          details?: { issues?: Array<{ code: string; path: string[]; message: string }> };
        };

        expect(response.code).toBe('SCHEMA_INVALID');
        expect(response.details?.issues).toBeDefined();
        const issues = response.details!.issues!;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(issues[0].path).toEqual(['logic', 'states']);
        expect(issues[0].message).toContain('editor-agent');

        // 副作用断言：输入对象无任何变化、saveSchema 未被调用
        expect(JSON.stringify(draftSchema)).toBe(originalSnapshot);
        expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
      });
    });

    it('valid draft enters real toolchain normally under unblocked manifest', async () => {
      const draftSchema = JSON.parse(JSON.stringify(conformanceFixture.schema));
      const result = await service.previewPatch(
        {
          draftSchema,
          patch: [
            {
              op: 'updateProps',
              componentId: 'change-price',
              props: { children: 'New Label' },
            },
          ],
        },
        'trace-draft-ok',
      );

      expect(result).toBeDefined();
      expect(result.patch.length).toBe(1);
      expect(result.schema!.components['change-price']!.props!.children).toBe('New Label');
      expect(result.schema!.logic?.states).toBeDefined();
    });
  });

  describe('5. ToolExecutionService.previewPatch: Patch 后结果', () => {
    it('rejects patch when replacePageLogic introduces an unsupported capability on legacy schema; draft unchanged, not saved, no applicable patch returned', async () => {
      const legacyDraft = contract.deepFreeze(
        JSON.parse(JSON.stringify(conformanceFixture.legacySchema)),
      );
      const originalSnapshot = JSON.stringify(legacyDraft);

      // 构造包含 action-flow 的 replacePageLogic patch（结构在正常 manifest 下完全合法）
      const patchWithBlockedFlow = [
        {
          op: 'replacePageLogic' as const,
          logic: {
            states: { count: 0 },
            flows: {
              submitFlow: {
                steps: [{ type: 'setValue', field: 'state.count', value: 1 }],
              },
            },
          },
        },
      ];

      await withBlockedCapabilityAsync('action-flow', 'editor-agent', async () => {
        let caughtError: unknown;
        try {
          await service.previewPatch(
            {
              draftSchema: legacyDraft,
              patch: patchWithBlockedFlow,
            },
            'trace-patch-result-blocked',
          );
        } catch (error) {
          caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(AgentToolException);
        const toolException = caughtError as AgentToolException;
        const response = toolException.getResponse() as {
          code: string;
          message: string;
          details?: { issues?: Array<{ code: string; path: string[]; message: string }> };
        };

        expect(response.code).toBe('SCHEMA_INVALID');
        expect(response.details?.issues).toBeDefined();
        const issues = response.details!.issues!;
        expect(issues.some((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
        expect(issues.some((i) => i.message.includes('action-flow'))).toBe(true);

        // 副作用断言：draft 原始对象未被改动、saveSchema 未被调用、不返回成功 patch
        expect(JSON.stringify(legacyDraft)).toBe(originalSnapshot);
        expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
      });
    });

    it('supported patch retains logic, and legacy patch does not introduce unwanted own logic', async () => {
      // 1. supported patch 正常保留 logic
      const legacyDraft1 = JSON.parse(JSON.stringify(conformanceFixture.legacySchema));
      const patchWithLogic = [
        {
          op: 'replacePageLogic' as const,
          logic: {
            states: { count: 10 },
          },
        },
      ];
      const resultWithLogic = await service.previewPatch(
        {
          draftSchema: legacyDraft1,
          patch: patchWithLogic,
        },
        'trace-supported-patch-logic',
      );
      expect(resultWithLogic.schema!.logic?.states).toEqual({ count: 10 });

      // 2. legacy 正向操作（更新属性）不新增 own logic
      const legacyDraft2 = JSON.parse(JSON.stringify(conformanceFixture.legacySchema));
      const resultLegacy = await service.previewPatch(
        {
          draftSchema: legacyDraft2,
          patch: [
            {
              op: 'updateProps' as const,
              componentId: 'legacy-btn',
              props: { children: 'Submitting...' },
            },
          ],
        },
        'trace-legacy-patch-no-logic',
      );
      expect(resultLegacy.schema!.logic).toBeUndefined();
      expect(resultLegacy.schema!.components['legacy-btn']!.props!.children).toBe('Submitting...');
    });
  });
});
