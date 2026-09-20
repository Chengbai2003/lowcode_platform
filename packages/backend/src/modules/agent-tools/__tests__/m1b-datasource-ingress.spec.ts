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

const m1bFixture = require('../../../../../../test-fixtures/m1b-datasource-conformance.json');
const m1aFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

describe('Agent Tools Ingress: data-source default-deny (M1b-1 PR A / Refs #64)', () => {
  let service: ToolExecutionService;
  let patchValidationService: PatchValidationService;
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
    patchValidationService = new PatchValidationService(metaRegistry, patchApplyService);
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

  describe('entrance 4a: ToolExecutionService.previewPatch draft 输入（生产清单）', () => {
    it('rejects data-source draft with CAPABILITY_UNSUPPORTED; draft unmodified; no save', async () => {
      const draftSchema = JSON.parse(JSON.stringify(m1bFixture.schema));
      const originalSnapshot = JSON.stringify(draftSchema);

      let caughtError: unknown;
      try {
        await service.previewPatch(
          {
            draftSchema,
            patch: [
              {
                op: 'updateProps',
                componentId: 'searchBtn',
                props: { children: '搜索' },
              },
            ],
          },
          'trace-m1b-draft-blocked',
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
      const issues = response.details?.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
      expect(issues.some((i) => i.message.includes('data-source'))).toBe(true);

      expect(JSON.stringify(draftSchema)).toBe(originalSnapshot);
      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
    });
  });

  describe('entrance 4b: Patch 结果（replacePageLogic 引入 dataSources，生产清单）', () => {
    it('rejects patch result with CAPABILITY_UNSUPPORTED; legacy draft unchanged; no save', async () => {
      const legacyDraft = JSON.parse(JSON.stringify(m1aFixture.legacySchema));
      const originalSnapshot = JSON.stringify(legacyDraft);

      const patchWithDataSources = [
        {
          op: 'replacePageLogic' as const,
          logic: {
            states: { rows: [] },
            dataSources: {
              searchItems: {
                operationRef: { operationId: 'demo.items.search', revision: '1' },
              },
            },
          },
        },
      ];

      let caughtError: unknown;
      try {
        await service.previewPatch(
          {
            draftSchema: legacyDraft,
            patch: patchWithDataSources,
          },
          'trace-m1b-patch-result-blocked',
        );
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(AgentToolException);
      const toolException = caughtError as AgentToolException;
      const response = toolException.getResponse() as {
        code: string;
        details?: { issues?: Array<{ code: string; path: string[]; message: string }> };
      };
      expect(response.code).toBe('SCHEMA_INVALID');
      const issues = response.details?.issues ?? [];
      expect(issues.some((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
      expect(issues.some((i) => i.message.includes('data-source'))).toBe(true);

      expect(JSON.stringify(legacyDraft)).toBe(originalSnapshot);
      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
    });

    it('regression: plain states replacePageLogic still passes under production manifest', async () => {
      const legacyDraft = JSON.parse(JSON.stringify(m1aFixture.legacySchema));
      const result = await service.previewPatch(
        {
          draftSchema: legacyDraft,
          patch: [{ op: 'replacePageLogic' as const, logic: { states: { count: 3 } } }],
        },
        'trace-m1b-patch-logic-ok',
      );
      expect(result.schema!.logic?.states).toEqual({ count: 3 });
    });
  });

  describe('entrance 4c: bindEvent / insertComponent 携带 executeDataSource（动作白名单提前拒绝）', () => {
    it('bindEvent rejects executeDataSource actions at the agent action whitelist before any patch is applied', async () => {
      const legacyDraft = JSON.parse(JSON.stringify(m1aFixture.legacySchema));

      let caughtError: unknown;
      try {
        await service.previewPatch(
          {
            draftSchema: legacyDraft,
            patch: [
              {
                op: 'bindEvent',
                componentId: 'legacy-btn',
                event: 'onClick',
                actions: [
                  {
                    type: 'executeDataSource',
                    sourceId: 'searchItems',
                    resultTo: 'state.rows',
                  },
                ],
              },
            ],
          },
          'trace-m1b-bindevent-blocked',
        );
      } catch (error) {
        caughtError = error;
      }

      // Agent 编辑面尚未开放 executeDataSource（PR D 才接线）：
      // 在动作白名单处以 "Unsupported action type" 提前拒绝 —— 与
      // CAPABILITY_UNSUPPORTED 同等计为有效 fail-close，且发生在任何写入之前。
      expect(caughtError).toBeInstanceOf(AgentToolException);
      const toolException = caughtError as AgentToolException;
      const response = toolException.getResponse() as { code: string; message: string };
      expect(response.message).toContain('executeDataSource');
      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
    });

    it('insertComponent with events containing executeDataSource is rejected the same way', async () => {
      const legacyDraft = JSON.parse(JSON.stringify(m1aFixture.legacySchema));

      let caughtError: unknown;
      try {
        await service.previewPatch(
          {
            draftSchema: legacyDraft,
            patch: [
              {
                op: 'insertComponent',
                parentId: 'root',
                component: {
                  id: 'search-btn-2',
                  type: 'Button',
                  props: { children: '查询' },
                  events: {
                    onClick: [
                      {
                        type: 'executeDataSource',
                        sourceId: 'searchItems',
                        resultTo: 'state.rows',
                      },
                    ],
                  },
                },
              },
            ],
          },
          'trace-m1b-insertcomponent-blocked',
        );
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(AgentToolException);
      const response = (caughtError as AgentToolException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.message).toContain('executeDataSource');
      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
    });

    it('regression: bindEvent with core actions (apiCall/setValue) still passes', async () => {
      const legacyDraft = JSON.parse(JSON.stringify(m1aFixture.legacySchema));
      const result = await service.previewPatch(
        {
          draftSchema: legacyDraft,
          patch: [
            {
              op: 'bindEvent',
              componentId: 'legacy-btn',
              event: 'onClick',
              actions: [{ type: 'apiCall', url: '/api/legacy', method: 'GET' }],
            },
          ],
        },
        'trace-m1b-bindevent-apicall-ok',
      );
      const events = result.schema!.components['legacy-btn']!.events as unknown as Record<
        string,
        Array<Record<string, unknown>>
      >;
      expect(events.onClick[0]!.type).toBe('apiCall');
    });
  });
});
