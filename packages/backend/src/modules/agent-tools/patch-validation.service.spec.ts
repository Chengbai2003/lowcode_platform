import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { PageSchema } from '@lowcode-platform/schema-contract';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { PatchValidationService } from './patch-validation.service';
import { EditorPatchOperation } from './types/editor-patch.types';

interface ConformanceFixture {
  readonly corpusVersion: string;
  readonly reviewReason: string;
  readonly schema: PageSchema;
  readonly legacySchema: PageSchema;
  readonly expected: {
    readonly canonicalLogic: Record<string, unknown>;
  };
  readonly negativeCases: Record<
    string,
    {
      readonly schema: PageSchema;
      readonly expectedCode: string;
      readonly expectedPath: ReadonlyArray<string | number>;
    }
  >;
}

function loadConformanceFixture(): ConformanceFixture {
  const candidatePaths = [
    path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
    path.resolve(process.cwd(), 'test-fixtures/m1a-page-logic-conformance.json'),
  ];
  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return JSON.parse(readFileSync(candidatePath, 'utf8')) as ConformanceFixture;
    }
  }
  throw new Error('Unable to locate test-fixtures/m1a-page-logic-conformance.json');
}

const conformanceFixture = loadConformanceFixture();
const negativeCaseEntries = Object.entries(conformanceFixture.negativeCases);

function createSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['form'],
      },
      form: {
        id: 'form',
        type: 'Form',
        childrenIds: ['button'],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: '提交' },
      },
    },
  };
}

function createSchemaWithDetachedHiddenDataNodes(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      ticketDetail: {
        id: 'ticketDetail',
        type: 'Div',
        props: {
          visible: false,
          initialValue: {
            code: 'TASK-001',
            status: '处理中',
          },
        },
        childrenIds: [],
      },
      ticketLogs: {
        id: 'ticketLogs',
        type: 'Div',
        props: {
          visible: false,
          initialValue: [{ key: '1', action: '提交申请' }],
        },
        childrenIds: [],
      },
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['headerActions'],
      },
      headerActions: {
        id: 'headerActions',
        type: 'Space',
        childrenIds: ['btn-pass'],
      },
      'btn-pass': {
        id: 'btn-pass',
        type: 'Button',
        props: { children: '通过' },
      },
    },
  };
}

async function expectToolError(callback: () => void, code: string, message?: string) {
  try {
    callback();
    throw new Error('Expected callback to throw');
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

describe('PatchValidationService', () => {
  let applyService: PatchApplyService;
  let service: PatchValidationService;

  beforeEach(() => {
    applyService = new PatchApplyService();
    service = new PatchValidationService(new ComponentMetaRegistry(), applyService);
  });

  it('accepts sequential patch operations when later steps target newly inserted nodes', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        component: {
          id: 'new-input',
          type: 'Input',
          props: { placeholder: '邮箱' },
        },
      },
      {
        op: 'updateProps',
        componentId: 'new-input',
        props: { placeholder: '请输入邮箱' },
      },
    ];
    const resultSchema = applyService.applyPatch(baseSchema, patch);

    expect(() =>
      service.validatePatchAgainstSchema(baseSchema, patch, resultSchema, 'trace-1'),
    ).not.toThrow();
  });

  it('strictly rejects detached hidden data nodes (no component-library knowledge)', () => {
    const baseSchema = createSchemaWithDetachedHiddenDataNodes();
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'btn-pass',
        props: { children: 'pass' },
      },
    ];
    const resultSchema = applyService.applyPatch(baseSchema, patch);

    // Contract 采用严格孤儿策略：隐藏数据 Div 特例已被移除（Issue #16 / PR #20 决策）
    expect(() =>
      service.validatePatchAgainstSchema(baseSchema, patch, resultSchema, 'trace-hidden'),
    ).toThrow(/orphaned/);
  });

  it('rejects customScript in bindEvent', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'bindEvent',
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'customScript', code: 'alert(1)' }],
      },
    ];

    await expectToolError(() => {
      service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
    }, 'PATCH_POLICY_BLOCKED');
  });

  it('rejects unsupported actions in insertComponent events', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        component: {
          id: 'unsafe-button',
          type: 'Button',
          events: { onClick: [{ type: 'unsupported' }] },
        },
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(
          createSchema(),
          patch,
          createSchema(),
          'trace-insert-events',
        );
      },
      'PATCH_INVALID',
      'Unsupported action type unsupported',
    );
  });

  it('rejects missing componentId targets', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'missing',
        props: { children: 'Nope' },
      },
    ];

    await expectToolError(() => {
      service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
    }, 'NODE_NOT_FOUND');
  });

  it('rejects unsupported inserted component types', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        component: {
          id: 'fancy',
          type: 'UnknownWidget',
        },
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
      },
      'PATCH_INVALID',
      'Unsupported component type',
    );
  });

  it('rejects removing the root node', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'removeComponent',
        componentId: 'root',
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
      },
      'PATCH_INVALID',
      'root',
    );
  });

  it('still rejects actual orphan components after applying a patch', async () => {
    const schemaWithOrphan: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        ...createSchema().components,
        orphan: {
          id: 'orphan',
          type: 'Div',
          props: { children: 'dangling' },
          childrenIds: [],
        },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '继续提交' },
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(
          schemaWithOrphan,
          patch,
          schemaWithOrphan,
          'trace-orphan',
        );
      },
      'SCHEMA_INVALID',
      'orphaned component',
    );
  });

  it('rejects moveComponent cycles', async () => {
    const nestedSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['parent'],
        },
        parent: {
          id: 'parent',
          type: 'Container',
          childrenIds: ['child'],
        },
        child: {
          id: 'child',
          type: 'Container',
          childrenIds: [],
        },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'moveComponent',
        componentId: 'parent',
        newParentId: 'child',
        newIndex: 0,
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(nestedSchema, patch, nestedSchema, 'trace-1');
      },
      'PATCH_INVALID',
      'descendant',
    );
  });

  it('accepts valid replacePageLogic operations', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 0 },
          computed: { double: 'state.count * 2' },
        },
      },
    ];
    const candidate = applyService.applyPatch(baseSchema, patch);

    expect(() =>
      service.validatePatchAgainstSchema(baseSchema, patch, candidate, 'trace-logic-valid'),
    ).not.toThrow();
  });

  it.each([
    ['null', null],
    ['string', 'not-an-object'],
    ['array', [1, 2, 3]],
    ['number', 123],
    ['undefined', undefined],
  ])('rejects replacePageLogic with non-plain-object logic (%s)', async (_, invalidLogic) => {
    const patch = [
      {
        op: 'replacePageLogic',
        logic: invalidLogic,
      },
    ] as unknown as EditorPatchOperation[];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
      },
      'PATCH_INVALID',
      'replacePageLogic requires logic object',
    );

    await expectToolError(
      () => {
        service.previewValidatedSchema(createSchema(), patch, 'trace-1');
      },
      'PATCH_INVALID',
      'replacePageLogic requires logic object',
    );
  });

  it('rejects replacePageLogic with missing computed reference and preserves structured issues', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: {},
          computed: { double: 'state.count * 2' },
        },
      },
    ];
    const candidate = applyService.applyPatch(baseSchema, patch);

    try {
      service.validatePatchAgainstSchema(baseSchema, patch, candidate, 'trace-logic-missing');
      throw new Error('Expected validation to fail');
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
            path: ['logic', 'computed', 'double'],
          }),
        ]),
      );
    }
  });

  it('rejects replacePageLogic with circular computed references', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: {},
          computed: {
            a: 'computed.b',
            b: 'computed.a',
          },
        },
      },
    ];
    const candidate = applyService.applyPatch(baseSchema, patch);

    try {
      service.validatePatchAgainstSchema(baseSchema, patch, candidate, 'trace-logic-cycle');
      throw new Error('Expected validation to fail');
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
            code: 'COMPUTED_CYCLE',
          }),
        ]),
      );
    }
  });

  it('rejects replacePageLogic with syntax error in expression', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 1 },
          computed: { bad: 'state.count +' },
        },
      },
    ];
    const candidate = applyService.applyPatch(baseSchema, patch);

    try {
      service.validatePatchAgainstSchema(baseSchema, patch, candidate, 'trace-logic-parse');
      throw new Error('Expected validation to fail');
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
            code: 'COMPUTED_EXPRESSION_PARSE_ERROR',
            path: ['logic', 'computed', 'bad'],
          }),
        ]),
      );
    }
  });

  it('rejects replacePageLogic with expression exceeding budget length', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: {},
          computed: { long: '1'.repeat(10001) },
        },
      },
    ];
    const candidate = applyService.applyPatch(baseSchema, patch);

    try {
      service.validatePatchAgainstSchema(baseSchema, patch, candidate, 'trace-logic-budget');
      throw new Error('Expected validation to fail');
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
            code: 'COMPUTED_EXPRESSION_TOO_LONG',
            path: ['logic', 'computed', 'long'],
          }),
        ]),
      );
    }
  });

  describe('M1a-3 / C2.1 Agent validator conformance against unified fixture', () => {
    it('covers exactly 9 negative cases in the conformance fixture', () => {
      expect(negativeCaseEntries).toHaveLength(9);
    });

    it('returns canonical deep-frozen schema matching expected.canonicalLogic for main schema', () => {
      const canonical = service.previewValidatedSchema(
        conformanceFixture.schema,
        [],
        'trace-c2-main',
      );
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(Object.isFrozen(canonical.components)).toBe(true);
      expect(Object.isFrozen(canonical.components.root)).toBe(true);
      expect(Object.isFrozen(canonical.logic)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.states)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.computed)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.flows)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.flows?.submitOrder)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.flows?.submitOrder?.steps)).toBe(true);
      expect(Object.isFrozen(canonical.logic?.flows?.submitOrder?.steps?.[0])).toBe(true);
      expect(canonical.logic).toEqual(conformanceFixture.expected.canonicalLogic);
    });

    it('accepts legacySchema without logic', () => {
      const canonical = service.previewValidatedSchema(
        conformanceFixture.legacySchema,
        [],
        'trace-c2-legacy',
      );
      expect(canonical.schemaVersion).toBe(0);
      expect(Object.isFrozen(canonical)).toBe(true);
    });

    it.each(negativeCaseEntries)(
      'rejects negative case "%s" with exact expectedCode and expectedPath via previewValidatedSchema',
      (_caseName, testCase) => {
        try {
          service.previewValidatedSchema(testCase.schema, [], 'trace-c2-neg');
          throw new Error('Expected previewValidatedSchema to throw AgentToolException');
        } catch (error) {
          expect(error).toBeInstanceOf(AgentToolException);
          const response = (error as AgentToolException).getResponse() as {
            code: string;
            details?: {
              issues?: Array<{ code: string; path: (string | number)[]; message: string }>;
            };
          };
          expect(response.code).toBe('SCHEMA_INVALID');
          const matched = response.details?.issues?.find(
            (issue) => issue.code === testCase.expectedCode,
          );
          expect(matched).toBeDefined();
          expect(matched?.path).toEqual(testCase.expectedPath);
        }
      },
    );

    it.each(negativeCaseEntries)(
      'rejects negative case "%s" with exact expectedCode and expectedPath via replacePageLogic patch',
      (_caseName, testCase) => {
        const baseSchema: PageSchema = {
          schemaVersion: 0,
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page', childrenIds: [] },
          },
        };
        const patch: EditorPatchOperation[] = [
          {
            op: 'replacePageLogic',
            logic: (testCase.schema.logic ?? {}) as Record<string, unknown>,
          },
        ];
        try {
          service.previewValidatedSchema(baseSchema, patch, 'trace-c2-patch-neg');
          throw new Error('Expected previewValidatedSchema to throw AgentToolException');
        } catch (error) {
          expect(error).toBeInstanceOf(AgentToolException);
          const response = (error as AgentToolException).getResponse() as {
            code: string;
            details?: {
              issues?: Array<{ code: string; path: (string | number)[]; message: string }>;
            };
          };
          expect(response.code).toBe('SCHEMA_INVALID');
          const matched = response.details?.issues?.find(
            (issue) => issue.code === testCase.expectedCode,
          );
          expect(matched).toBeDefined();
          expect(matched?.path).toEqual(testCase.expectedPath);
        }
      },
    );
  });
});
