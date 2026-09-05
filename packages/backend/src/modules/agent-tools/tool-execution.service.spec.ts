import * as fs from 'fs';
import * as path from 'path';
import { ContextAssemblerService } from '../schema-context';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import {
  PageSchema,
  ComponentNode,
  requireSupportedPageSchema,
} from '@lowcode-platform/schema-contract';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './types/tool.types';
import { EditorPatchOperationDto } from './dto/editor-patch.dto';

function createSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['container', 'sibling'],
      },
      container: {
        id: 'container',
        type: 'Container',
        childrenIds: ['button', 'group'],
      },
      sibling: {
        id: 'sibling',
        type: 'Container',
        childrenIds: [],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: '提交' },
      },
      group: {
        id: 'group',
        type: 'Container',
        childrenIds: ['child-input', 'child-input-2'],
      },
      'child-input': {
        id: 'child-input',
        type: 'Input',
        props: { placeholder: 'Name' },
      },
      'child-input-2': {
        id: 'child-input-2',
        type: 'Input',
        props: { placeholder: 'Email' },
      },
    },
  };
}

async function expectToolError(callback: () => Promise<unknown>, code: string, message?: string) {
  try {
    await callback();
    throw new Error('Expected callback to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(AgentToolException);
    const response = (error as AgentToolException).getResponse() as {
      code: string;
      message: string;
    };
    expect(response.code).toBe(code);
    if (message) {
      expect(response.message).toContain(message);
    }
  }
}

describe('ToolExecutionService', () => {
  let service: ToolExecutionService;
  let pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema' | 'saveSchema'>;

  beforeEach(() => {
    pageSchemaServiceMock = {
      getSchema: jest.fn().mockResolvedValue({
        pageId: 'page-1',
        version: 4,
        snapshotId: 'page-1-v4',
        savedAt: '2026-03-20T00:00:00.000Z',
        schema: createSchema(),
      }),
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

  async function createContext(): Promise<ToolExecutionContext> {
    return service.createExecutionContext(
      { draftSchema: createSchema() as unknown as Record<string, unknown> },
      'trace-1',
    );
  }

  it('executes update_component_props successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'update_component_props',
      { componentId: 'button', props: { children: '立即提交' } },
      context,
    );

    expect(context.workingSchema.components.button.props?.children).toBe('立即提交');
  });

  it('expands update_components_props into multiple updateProps operations', async () => {
    const context = await createContext();

    await service.executeTool(
      'update_components_props',
      {
        componentIds: ['child-input', 'child-input-2'],
        props: { disabled: true },
      },
      context,
    );

    expect(context.accumulatedPatch).toEqual([
      { op: 'updateProps', componentId: 'child-input', props: { disabled: true } },
      { op: 'updateProps', componentId: 'child-input-2', props: { disabled: true } },
    ]);
    expect(context.workingSchema.components['child-input'].props?.disabled).toBe(true);
    expect(context.workingSchema.components['child-input-2'].props?.disabled).toBe(true);
  });

  it('rejects update_component_props for missing targets', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'update_component_props',
          { componentId: 'missing', props: {} },
          context,
        ),
      'NODE_NOT_FOUND',
    );
  });

  it('expands update_components_props into multiple updateProps operations', async () => {
    const context = await createContext();

    await service.executeTool(
      'update_components_props',
      {
        componentIds: ['child-input', 'child-input-2'],
        props: { disabled: true },
      },
      context,
    );

    expect(context.accumulatedPatch).toEqual([
      { op: 'updateProps', componentId: 'child-input', props: { disabled: true } },
      { op: 'updateProps', componentId: 'child-input-2', props: { disabled: true } },
    ]);
    expect(context.workingSchema.components['child-input'].props?.disabled).toBe(true);
    expect(context.workingSchema.components['child-input-2'].props?.disabled).toBe(true);
  });

  it('executes insert_component successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'insert_component',
      {
        parentId: 'container',
        component: { id: 'extra-input', type: 'Input', props: { placeholder: 'Email' } },
      },
      context,
    );

    expect(context.workingSchema.components['extra-input']).toBeDefined();
  });

  it('rejects insert_component with unsupported component types', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'insert_component',
          { parentId: 'container', component: { id: 'extra', type: 'FakeWidget' } },
          context,
        ),
      'PATCH_INVALID',
      'Unsupported component type',
    );
  });

  it('executes bind_event successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'bind_event',
      {
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
      },
      context,
    );

    expect(context.workingSchema.components.button.events?.onClick).toEqual([
      { type: 'apiCall', url: '/api/save', method: 'POST' },
    ]);
  });

  it('rejects bind_event with customScript', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'bind_event',
          {
            componentId: 'button',
            event: 'onClick',
            actions: [{ type: 'customScript', code: 'alert(1)' }],
          },
          context,
        ),
      'PATCH_POLICY_BLOCKED',
    );
  });

  it('executes remove_component successfully', async () => {
    const context = await createContext();

    await service.executeTool('remove_component', { componentId: 'group' }, context);

    expect(context.workingSchema.components.group).toBeUndefined();
    expect(context.workingSchema.components['child-input']).toBeUndefined();
  });

  it('rejects remove_component for missing nodes', async () => {
    const context = await createContext();

    await expectToolError(
      () => service.executeTool('remove_component', { componentId: 'missing' }, context),
      'NODE_NOT_FOUND',
    );
  });

  it('executes move_component successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'move_component',
      { componentId: 'button', newParentId: 'sibling', newIndex: 0 },
      context,
    );

    expect(context.workingSchema.components.sibling.childrenIds).toEqual(['button']);
  });

  it('rejects move_component cycles', async () => {
    const nestedSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['parent'] },
        parent: { id: 'parent', type: 'Container', childrenIds: ['child'] },
        child: { id: 'child', type: 'Container', childrenIds: [] },
      },
    };
    const context = await service.createExecutionContext(
      { draftSchema: nestedSchema as unknown as Record<string, unknown> },
      'trace-1',
    );

    await expectToolError(
      () =>
        service.executeTool(
          'move_component',
          { componentId: 'parent', newParentId: 'child', newIndex: 0 },
          context,
        ),
      'PATCH_INVALID',
      'descendant',
    );
  });

  it('normalizes patch input when previewPatch is called with autoFix enabled', async () => {
    const response = await service.previewPatch(
      {
        draftSchema: createSchema() as unknown as Record<string, unknown>,
        autoFix: true,
        patch: [
          {
            op: 'insertComponent',
            parentId: 'container',
            index: -1,
            component: {
              id: 'input_email',
              type: 'Input',
              props: { placeholder: '邮箱' },
              events: [] as unknown as Record<string, unknown>,
            },
          },
        ],
      },
      'trace-1',
    );

    expect(response.patch[0]).toMatchObject({
      op: 'insertComponent',
      parentId: 'container',
      index: undefined,
      component: {
        id: 'input_email',
        type: 'Input',
        events: {},
      },
    });
    expect(response.warnings).toContain('Normalized insert index for component under container');
    expect(response.schema.components.input_email).toBeDefined();
  });

  it('normalizes Button danger alias when previewPatch autoFix is enabled', async () => {
    const response = await service.previewPatch(
      {
        draftSchema: createSchema() as unknown as Record<string, unknown>,
        autoFix: true,
        patch: [
          {
            op: 'updateProps',
            componentId: 'button',
            props: {
              type: 'danger',
            },
          },
        ],
      },
      'trace-1',
    );

    expect(response.patch).toEqual([
      {
        op: 'updateProps',
        componentId: 'button',
        props: {
          danger: true,
        },
      },
    ]);
    expect(response.schema.components.button.props?.danger).toBe(true);
    expect(response.schema.components.button.props?.type).toBeUndefined();
    expect(response.warnings).toContain('Normalized Button danger prop for button');
  });

  it('executes replace_page_logic tool successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'replace_page_logic',
      {
        logic: {
          states: { count: 42 },
          computed: { double: 'state.count * 2' },
        },
      },
      context,
    );

    expect(context.accumulatedPatch).toEqual([
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 42 },
          computed: { double: 'state.count * 2' },
        },
      },
    ]);
    expect(context.workingSchema.logic).toEqual({
      states: { count: 42 },
      computed: { double: 'state.count * 2' },
    });
  });

  it.each([
    ['null', null],
    ['string', 'not-an-object'],
    ['array', [1, 2]],
    ['number', 42],
    ['undefined', undefined],
  ])('rejects replace_page_logic with non-plain-object logic (%s)', async (_, invalidLogic) => {
    const context = await createContext();
    await expectToolError(
      () =>
        service.executeTool(
          'replace_page_logic',
          { logic: invalidLogic } as unknown as Record<string, unknown>,
          context,
        ),
      'PATCH_INVALID',
      'replacePageLogic requires logic object',
    );
  });

  it('normalizes expression whitespace via Contract in executeTool and previewPatch', async () => {
    const context = await createContext();

    await service.executeTool(
      'replace_page_logic',
      {
        logic: {
          states: { count: 5 },
          computed: { double: '  state.count * 2  ' },
        },
      },
      context,
    );

    expect(context.accumulatedPatch).toEqual([
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 5 },
          computed: { double: 'state.count * 2' },
        },
      },
    ]);
    expect(context.workingSchema.logic?.computed?.double).toBe('state.count * 2');

    const previewResponse = await service.previewPatch(
      {
        draftSchema: createSchema() as unknown as Record<string, unknown>,
        patch: [
          {
            op: 'replacePageLogic',
            logic: {
              states: { active: true },
              computed: { status: "  'Active: ' + state.active  " },
            },
          },
        ],
      },
      'trace-whitespace-trim',
    );

    expect(previewResponse.patch[0]).toEqual({
      op: 'replacePageLogic',
      logic: {
        states: { active: true },
        computed: { status: "'Active: ' + state.active" },
      },
    });
    expect(previewResponse.schema.logic?.computed?.status).toBe("'Active: ' + state.active");
  });

  it('clears page logic when passing empty logic object', async () => {
    const schemaWithLogic = {
      ...createSchema(),
      logic: {
        states: { count: 10 },
        computed: { double: 'state.count * 2' },
      },
    };
    const context = await service.createExecutionContext(
      { draftSchema: schemaWithLogic as unknown as Record<string, unknown> },
      'trace-clear-logic',
    );

    await service.executeTool('replace_page_logic', { logic: {} }, context);

    expect(context.accumulatedPatch).toEqual([
      {
        op: 'replacePageLogic',
        logic: {},
      },
    ]);
    expect(context.workingSchema.logic).toEqual({});
  });

  it('preserves structured issues when draftSchema has Contract validation failure', async () => {
    const invalidDraftSchema = {
      ...createSchema(),
      logic: {
        states: {},
        computed: { broken: 'state.nonexistent + 1' },
      },
    };

    try {
      await service.createExecutionContext(
        { draftSchema: invalidDraftSchema as unknown as Record<string, unknown> },
        'trace-structured-issues',
      );
      throw new Error('Expected createExecutionContext to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AgentToolException);
      const response = (error as AgentToolException).getResponse() as {
        code: string;
        details?: { issues?: Array<{ code: string; path: (string | number)[]; message: string }> };
      };
      expect(response.code).toBe('SCHEMA_INVALID');
      expect(response.details?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'COMPUTED_REFERENCE_MISSING',
            path: ['logic', 'computed', 'broken'],
          }),
        ]),
      );
    }
  });

  describe('M1a-3 / C2.2 Agent preview round-trip conformance', () => {
    function loadConformanceFixture() {
      const candidatePaths = [
        path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
        path.resolve(process.cwd(), 'test-fixtures/m1a-page-logic-conformance.json'),
      ];
      for (const candidatePath of candidatePaths) {
        if (fs.existsSync(candidatePath)) {
          return JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        }
      }
      throw new Error('Unable to locate test-fixtures/m1a-page-logic-conformance.json');
    }

    const conformanceFixture = loadConformanceFixture();

    function normalizeEmptyOptionalFields(schema: PageSchema): PageSchema {
      const components: Record<string, ComponentNode> = {};
      for (const [id, comp] of Object.entries(schema.components)) {
        const hasProps = comp.props !== undefined && Object.keys(comp.props).length > 0;
        const hasEvents = comp.events !== undefined && Object.keys(comp.events).length > 0;
        const hasChildren = comp.childrenIds !== undefined && comp.childrenIds.length > 0;
        components[id] = {
          id: comp.id,
          type: comp.type,
          ...(hasProps ? { props: comp.props } : {}),
          ...(hasChildren ? { childrenIds: comp.childrenIds } : {}),
          ...(hasEvents ? { events: comp.events } : {}),
        };
      }
      return {
        schemaVersion: schema.schemaVersion,
        rootId: schema.rootId,
        components,
        ...(schema.logic ? { logic: schema.logic } : {}),
      };
    }

    function createConformanceCandidates() {
      const schemaA = requireSupportedPageSchema(conformanceFixture.schema);
      const candidateB: PageSchema = {
        ...schemaA,
        components: {
          ...schemaA.components,
          submit: {
            ...schemaA.components.submit,
            props: {
              ...schemaA.components.submit.props,
              children: 'Submit revised',
            },
          },
        },
      };
      const schemaB = requireSupportedPageSchema(candidateB);

      const candidateC: PageSchema = {
        ...schemaB,
        logic: {
          ...schemaB.logic!,
          states: {
            ...schemaB.logic!.states,
            price: 7,
          },
        },
      };
      const schemaC = requireSupportedPageSchema(candidateC);

      const legacySchema = requireSupportedPageSchema(conformanceFixture.legacySchema);

      return { schemaA, schemaB, schemaC, legacySchema };
    }

    it('previewPatch applies component updateProps on A to return B without saving or mutating inputs', async () => {
      const { schemaA, schemaB } = createConformanceCandidates();
      const draftInput = JSON.parse(JSON.stringify(schemaA));
      const patchInput: EditorPatchOperationDto[] = [
        {
          op: 'updateProps',
          componentId: 'submit',
          props: { children: 'Submit revised' },
        },
      ];
      const originalPatchInput = JSON.parse(JSON.stringify(patchInput));

      const response = await service.previewPatch(
        {
          draftSchema: draftInput as unknown as Record<string, unknown>,
          patch: patchInput,
          autoFix: false,
        },
        'trace-c2-2-preview-1',
      );

      // Never calls persistence
      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();

      // Inputs remain unmodified
      expect(draftInput).toEqual(schemaA);
      expect(patchInput).toEqual(originalPatchInput);

      // Returned patch contains requested operations
      expect(response.patch).toEqual([
        {
          op: 'updateProps',
          componentId: 'submit',
          props: { children: 'Submit revised' },
        },
      ]);

      // Schema matches B with full declarations preserved
      expect(normalizeEmptyOptionalFields(response.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaB),
      );
      expect(response.schema.logic).toEqual(schemaA.logic);
      expect(response.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(response.schema.components.submit.props?.children).toBe('Submit revised');
      expect(response.schema.components.submit.events).toEqual(schemaA.components.submit.events);

      // Representative nested freeze
      expect(response.schema).toBeDefined();
      expect(Object.isFrozen(response.schema)).toBe(true);
      expect(Object.isFrozen(response.schema.components)).toBe(true);
      expect(Object.isFrozen(response.schema.components.root)).toBe(true);
      expect(Object.isFrozen(response.schema.components.submit)).toBe(true);
      expect(response.schema.logic).toBeDefined();
      expect(Object.isFrozen(response.schema.logic)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.states)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.computed)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.flows)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.flows?.submitOrder)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.flows?.submitOrder?.steps)).toBe(true);
    });

    it('previewPatch applies replacePageLogic on B to return C with price=7 without saving or mutating inputs', async () => {
      const { schemaB, schemaC } = createConformanceCandidates();
      const draftInput = JSON.parse(JSON.stringify(schemaB));
      const patchInput: EditorPatchOperationDto[] = [
        {
          op: 'replacePageLogic',
          logic: schemaC.logic as unknown as Record<string, unknown>,
        },
      ];
      const originalPatchInput = JSON.parse(JSON.stringify(patchInput));

      const response = await service.previewPatch(
        {
          draftSchema: draftInput as unknown as Record<string, unknown>,
          patch: patchInput,
          autoFix: false,
        },
        'trace-c2-2-preview-2',
      );

      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
      expect(draftInput).toEqual(schemaB);
      expect(patchInput).toEqual(originalPatchInput);

      expect(response.patch[0].op).toBe('replacePageLogic');
      expect(response.schema.logic?.states?.price).toBe(7);
      expect(response.schema.logic?.computed).toEqual(schemaB.logic?.computed);
      expect(response.schema.logic?.flows).toEqual(schemaB.logic?.flows);
      expect(response.schema.components.submit.props?.children).toBe('Submit revised');
      expect(response.schema.logic).toEqual(schemaC.logic);
      expect(normalizeEmptyOptionalFields(response.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaC),
      );

      expect(response.schema).toBeDefined();
      expect(Object.isFrozen(response.schema)).toBe(true);
      expect(response.schema.logic).toBeDefined();
      expect(Object.isFrozen(response.schema.logic)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.states)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.computed)).toBe(true);
      expect(Object.isFrozen(response.schema.logic?.flows)).toBe(true);
    });

    it('previewPatch applies combined ordered patches (A -> B -> C) in a single preview', async () => {
      const { schemaA, schemaC } = createConformanceCandidates();
      const draftInput = JSON.parse(JSON.stringify(schemaA));
      const patchInput: EditorPatchOperationDto[] = [
        {
          op: 'updateProps',
          componentId: 'submit',
          props: { children: 'Submit revised' },
        },
        {
          op: 'replacePageLogic',
          logic: schemaC.logic as unknown as Record<string, unknown>,
        },
      ];
      const originalPatchInput = JSON.parse(JSON.stringify(patchInput));

      const response = await service.previewPatch(
        {
          draftSchema: draftInput as unknown as Record<string, unknown>,
          patch: patchInput,
          autoFix: false,
        },
        'trace-c2-2-preview-3',
      );

      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
      expect(draftInput).toEqual(schemaA);
      expect(patchInput).toEqual(originalPatchInput);

      expect(response.patch).toHaveLength(2);
      expect(response.patch[0].op).toBe('updateProps');
      expect(response.patch[1].op).toBe('replacePageLogic');

      expect(response.schema.components.submit.props?.children).toBe('Submit revised');
      expect(response.schema.logic?.states?.price).toBe(7);
      expect(normalizeEmptyOptionalFields(response.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaC),
      );
      expect(response.schema.logic).toEqual(schemaC.logic);

      expect(response.schema).toBeDefined();
      expect(Object.isFrozen(response.schema)).toBe(true);
      expect(response.schema.logic).toBeDefined();
      expect(Object.isFrozen(response.schema.logic)).toBe(true);
    });

    it('previewPatch applies component patch to legacySchema preserving absent logic', async () => {
      const { legacySchema } = createConformanceCandidates();
      const draftInput = JSON.parse(JSON.stringify(legacySchema));
      const patchInput: EditorPatchOperationDto[] = [
        {
          op: 'updateProps',
          componentId: 'legacy-btn',
          props: { children: 'Legacy Trigger revised' },
        },
      ];
      const originalPatchInput = JSON.parse(JSON.stringify(patchInput));

      const response = await service.previewPatch(
        {
          draftSchema: draftInput as unknown as Record<string, unknown>,
          patch: patchInput,
          autoFix: false,
        },
        'trace-c2-2-preview-4',
      );

      expect(pageSchemaServiceMock.saveSchema).not.toHaveBeenCalled();
      expect(draftInput).toEqual(legacySchema);
      expect(patchInput).toEqual(originalPatchInput);

      expect(response.patch).toEqual([
        {
          op: 'updateProps',
          componentId: 'legacy-btn',
          props: { children: 'Legacy Trigger revised' },
        },
      ]);

      const expectedLegacyRevised: PageSchema = {
        ...legacySchema,
        components: {
          ...legacySchema.components,
          'legacy-btn': {
            ...legacySchema.components['legacy-btn'],
            props: {
              ...legacySchema.components['legacy-btn'].props,
              children: 'Legacy Trigger revised',
            },
          },
        },
      };

      expect(response.schema).toEqual(expectedLegacyRevised);
      expect(Object.prototype.hasOwnProperty.call(response.schema, 'logic')).toBe(false);
      expect(response.schema.logic).toBeUndefined();
      expect(response.schema.components['legacy-btn'].props?.children).toBe(
        'Legacy Trigger revised',
      );
      expect(response.schema.components['legacy-btn'].events).toEqual(
        legacySchema.components['legacy-btn'].events,
      );
      expect(response.schema.components['legacy-text'].props).toEqual(
        legacySchema.components['legacy-text'].props,
      );

      expect(response.schema).toBeDefined();
      expect(Object.isFrozen(response.schema)).toBe(true);
      expect(Object.isFrozen(response.schema.components)).toBe(true);
    });

    it('previewPatch preserves -0 in state values when applying component updates', async () => {
      const { schemaA } = createConformanceCandidates();
      const schemaWithNegZero: PageSchema = {
        ...schemaA,
        logic: {
          ...schemaA.logic!,
          states: {
            ...schemaA.logic!.states,
            count: -0,
          },
        },
      };

      const response = await service.previewPatch(
        {
          draftSchema: schemaWithNegZero as unknown as Record<string, unknown>,
          patch: [
            {
              op: 'updateProps',
              componentId: 'submit',
              props: { children: 'Submit revised' },
            },
          ],
          autoFix: false,
        },
        'trace-c2-2-preview-negzero',
      );

      expect(response.schema.components.submit.props?.children).toBe('Submit revised');
      expect(Object.is(response.schema.logic?.states?.count, -0)).toBe(true);
    });

    it('previewPatch safely preserves -0 and own __proto__ keys without prototype pollution and passes Contract', async () => {
      const { schemaA } = createConformanceCandidates();

      const submitProps: Record<string, unknown> = {
        children: 'Submit',
      };
      Object.defineProperty(submitProps, '__proto__', {
        value: { safe_proto: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(submitProps, 'offset', {
        value: -0,
        enumerable: true,
        writable: true,
        configurable: true,
      });

      const schemaWithSpecialProps: PageSchema = {
        ...schemaA,
        components: {
          ...schemaA.components,
          submit: {
            ...schemaA.components.submit,
            props: submitProps as unknown as PageSchema['components'][string]['props'],
          },
        },
        logic: {
          ...schemaA.logic!,
          states: {
            ...schemaA.logic!.states,
            count: -0,
          },
        },
      };

      const response = await service.previewPatch(
        {
          draftSchema: schemaWithSpecialProps as unknown as Record<string, unknown>,
          patch: [
            {
              op: 'updateProps',
              componentId: 'submit',
              props: { children: 'Submit revised' },
            },
          ],
          autoFix: false,
        },
        'trace-c2-2-preview-proto',
      );

      // 1. 键和值保留
      expect(
        Object.prototype.hasOwnProperty.call(response.schema.components.submit.props, '__proto__'),
      ).toBe(true);
      expect(
        (response.schema.components.submit.props as Record<string, unknown>)['__proto__'],
      ).toEqual({ safe_proto: true });
      expect(Object.is(response.schema.components.submit.props?.offset, -0)).toBe(true);
      expect(Object.is(response.schema.logic?.states?.count, -0)).toBe(true);
      expect(response.schema.components.submit.props?.children).toBe('Submit revised');

      // 2. 原型未被改变且全局原型未被污染
      expect((Object.prototype as unknown as Record<string, unknown>).safe_proto).toBeUndefined();
      expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined();

      // 3. 结果通过 Contract 校验并深冻结
      expect(Object.isFrozen(response.schema)).toBe(true);
      const canonical = requireSupportedPageSchema(response.schema);
      expect(canonical).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(canonical.components.submit.props, '__proto__'),
      ).toBe(true);
      expect((canonical.components.submit.props as Record<string, unknown>)['__proto__']).toEqual({
        safe_proto: true,
      });
      expect(Object.is(canonical.components.submit.props?.offset, -0)).toBe(true);
      expect(Object.is(canonical.logic?.states?.count, -0)).toBe(true);
      expect((Object.prototype as unknown as Record<string, unknown>).safe_proto).toBeUndefined();
    });
  });
});
