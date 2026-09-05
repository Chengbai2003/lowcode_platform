import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { requireSupportedPageSchema } from '@lowcode-platform/schema-contract';
import type { ComponentNode, PageSchema } from '../../types';
import type { EditorPatchOperation } from '../types/patch';
import { applyPatchToSchema } from './patchAdapter';

function createSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['container', 'sidebar'],
      },
      container: {
        id: 'container',
        type: 'Container',
        childrenIds: ['button', 'group'],
      },
      sidebar: {
        id: 'sidebar',
        type: 'Container',
        childrenIds: [],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: 'Old' },
      },
      group: {
        id: 'group',
        type: 'Container',
        childrenIds: ['child'],
      },
      child: {
        id: 'child',
        type: 'Input',
        props: { placeholder: 'child' },
      },
    },
  };
}

describe('applyPatchToSchema', () => {
  it('applies insertComponent', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'insertComponent',
        parentId: 'container',
        component: {
          id: 'input-email',
          type: 'Input',
          props: { placeholder: 'Email' },
        },
      },
    ]);

    expect(result.components['input-email']).toBeDefined();
    expect(result.components.container.childrenIds).toContain('input-email');
  });

  it('applies updateProps', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '提交', disabled: true },
      },
    ]);

    expect(result.components.button.props).toMatchObject({
      children: '提交',
      disabled: true,
    });
  });

  it('applies bindEvent with replace semantics', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'bindEvent',
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
      },
    ]);

    expect(result.components.button.events).toEqual({
      onClick: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
    });
  });

  it('removes subtrees recursively', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'removeComponent',
        componentId: 'group',
      },
    ]);

    expect(result.components.group).toBeUndefined();
    expect(result.components.child).toBeUndefined();
    expect(result.components.container.childrenIds).toEqual(['button']);
  });

  it('moves components across parents', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'moveComponent',
        componentId: 'button',
        newParentId: 'sidebar',
        newIndex: 0,
      },
    ]);

    expect(result.components.container.childrenIds).not.toContain('button');
    expect(result.components.sidebar.childrenIds).toEqual(['button']);
  });

  it('applies a patch sequence consistently', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'container',
        component: {
          id: 'new-input',
          type: 'Input',
          props: { placeholder: 'Email' },
        },
      },
      {
        op: 'updateProps',
        componentId: 'new-input',
        props: { placeholder: '请输入邮箱' },
      },
    ];

    const result = applyPatchToSchema(createSchema(), patch);
    expect(result.components['new-input'].props?.placeholder).toBe('请输入邮箱');
  });

  it('preserves page logic without aliasing the input', () => {
    const schema: PageSchema = {
      ...createSchema(),
      logic: {
        states: {
          count: 1,
        },
        computed: {
          next: 'state.count + 1',
        },
      },
    };

    const result = applyPatchToSchema(schema, [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: 'Increment' },
      },
    ]);

    expect(result.logic).toEqual(schema.logic);
    expect(result.logic).not.toBe(schema.logic);
    expect(result.logic?.states).not.toBe(schema.logic?.states);
    expect(result.logic?.computed).not.toBe(schema.logic?.computed);
  });
});

interface ConformanceFixture {
  readonly corpusVersion: string;
  readonly reviewReason: string;
  readonly schema: PageSchema;
  readonly legacySchema: PageSchema;
  readonly expected: {
    readonly canonicalLogic: Record<string, unknown>;
  };
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

/**
 * Normalizes representation ONLY for confirmed empty optional fields:
 * - props: {} -> undefined when empty
 * - events: {} -> undefined when empty
 * - childrenIds: [] -> undefined when empty
 * Existing applyPatchToSchema initializes empty optional props/events/childrenIds.
 * Explicitly preserves all logic, non-empty props, non-empty events, and non-empty children.
 */
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

describe('M1a-3 / C2.2 Frontend Patch round-trip conformance', () => {
  function createCandidates() {
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

  it('applies updateProps on A to produce B while preserving all logic and keeping inputs unmodified', () => {
    const { schemaA, schemaB } = createCandidates();
    const patch: readonly EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'submit',
        props: { children: 'Submit revised' },
      },
    ];

    const inputSchemaSnapshot = JSON.stringify(schemaA);
    const inputPatchSnapshot = JSON.stringify(patch);

    const actualB = applyPatchToSchema(schemaA, patch);

    // Inputs remain unmodified
    expect(JSON.stringify(schemaA)).toBe(inputSchemaSnapshot);
    expect(JSON.stringify(patch)).toBe(inputPatchSnapshot);

    // Output is valid Contract schema
    expect(() => requireSupportedPageSchema(actualB)).not.toThrow();

    // Logic and declarations are completely preserved
    expect(actualB.logic).toEqual(schemaA.logic);
    expect(actualB.logic).toEqual(conformanceFixture.expected.canonicalLogic);
    expect(actualB.components.submit.props?.children).toBe('Submit revised');
    expect(actualB.components.submit.events).toEqual(schemaA.components.submit.events);
    expect(Object.keys(actualB.components)).toEqual(Object.keys(schemaA.components));
    expect(normalizeEmptyOptionalFields(actualB)).toEqual(normalizeEmptyOptionalFields(schemaB));
  });

  it('applies replacePageLogic on B to produce C with price=7 and all declarations preserved', () => {
    const { schemaB, schemaC } = createCandidates();
    const patch: readonly EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: schemaC.logic as unknown as Record<string, unknown>,
      },
    ];

    const inputSchemaSnapshot = JSON.stringify(schemaB);
    const inputPatchSnapshot = JSON.stringify(patch);

    const actualC = applyPatchToSchema(schemaB, patch);

    // Inputs remain unmodified
    expect(JSON.stringify(schemaB)).toBe(inputSchemaSnapshot);
    expect(JSON.stringify(patch)).toBe(inputPatchSnapshot);

    // Output is valid Contract schema
    expect(() => requireSupportedPageSchema(actualC)).not.toThrow();

    // Price is updated, all other states, computed, flows, and components preserved
    expect(actualC.logic?.states?.price).toBe(7);
    expect(actualC.logic?.computed).toEqual(schemaB.logic?.computed);
    expect(actualC.logic?.flows).toEqual(schemaB.logic?.flows);
    expect(actualC.components.submit.props?.children).toBe('Submit revised');
    expect(actualC.logic).toEqual(schemaC.logic);
    expect(normalizeEmptyOptionalFields(actualC)).toEqual(normalizeEmptyOptionalFields(schemaC));
  });

  it('applies component patch to legacySchema without introducing logic property', () => {
    const { legacySchema } = createCandidates();
    expect(Object.prototype.hasOwnProperty.call(legacySchema, 'logic')).toBe(false);

    const patch: readonly EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'legacy-btn',
        props: { children: 'Legacy Trigger revised' },
      },
    ];

    const inputSchemaSnapshot = JSON.stringify(legacySchema);
    const actualLegacy = applyPatchToSchema(legacySchema, patch);

    expect(JSON.stringify(legacySchema)).toBe(inputSchemaSnapshot);
    expect(() => requireSupportedPageSchema(actualLegacy)).not.toThrow();

    expect(Object.prototype.hasOwnProperty.call(actualLegacy, 'logic')).toBe(false);
    expect(actualLegacy.logic).toBeUndefined();
    expect(actualLegacy.components['legacy-btn'].props?.children).toBe('Legacy Trigger revised');
    expect(actualLegacy.components['legacy-btn'].events).toEqual(
      legacySchema.components['legacy-btn'].events,
    );
    expect(actualLegacy.components['legacy-text'].props).toEqual(
      legacySchema.components['legacy-text'].props,
    );
    expect(actualLegacy.components['legacy-text'].type).toBe(
      legacySchema.components['legacy-text'].type,
    );
  });
});
