import { assertValidPageSchema } from './schema-validation';

interface TestComponent {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds: string[];
  events?: Record<string, unknown>;
}

function createSchema(): { rootId: string; components: Record<string, TestComponent> } {
  return {
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['child'] },
      child: { id: 'child', type: 'Div', childrenIds: [] },
    },
  };
}

describe('assertValidPageSchema', () => {
  it('rejects missing and mismatched component ids', () => {
    const missingId = createSchema();
    delete missingId.components.child.id;
    expect(() => assertValidPageSchema(missingId)).toThrow('Component child id is required');

    const mismatchedId = createSchema();
    mismatchedId.components.child.id = 'other';
    expect(() => assertValidPageSchema(mismatchedId)).toThrow(
      'Component child id must match its key',
    );
  });

  it('rejects duplicate children, cycles, multiple parents, and ordinary orphans', () => {
    const duplicateChild = createSchema();
    duplicateChild.components.root.childrenIds = ['child', 'child'];
    expect(() => assertValidPageSchema(duplicateChild)).toThrow('more than once');

    const cycle = createSchema();
    cycle.components.child.childrenIds = ['root'];
    expect(() => assertValidPageSchema(cycle)).toThrow('component cycle');

    const multipleParents = createSchema();
    multipleParents.components.other = { id: 'other', type: 'Div', childrenIds: ['child'] };
    multipleParents.components.root.childrenIds = ['child', 'other'];
    expect(() => assertValidPageSchema(multipleParents)).toThrow('multiple parents');

    const orphan = createSchema();
    orphan.components.orphan = { id: 'orphan', type: 'Div', childrenIds: [] };
    expect(() => assertValidPageSchema(orphan)).toThrow('orphaned components: orphan');
  });

  it('allows detached hidden data nodes', () => {
    const schema = createSchema();
    schema.components.data = {
      id: 'data',
      type: 'Div',
      props: { visible: false, initialValue: { status: 'draft' } },
      childrenIds: [],
    };

    expect(() => assertValidPageSchema(schema)).not.toThrow();
  });

  it('rejects unknown event actions and nested customScript', () => {
    const unknownAction = createSchema();
    unknownAction.components.child.events = { onClick: [{ type: 'unknown' }] };
    expect(() => assertValidPageSchema(unknownAction)).toThrow('Unsupported action type unknown');

    const nestedCustomScript = createSchema();
    nestedCustomScript.components.child.events = {
      onClick: [{ type: 'if', then: [{ type: 'customScript', code: 'alert(1)' }] }],
    };
    expect(() => assertValidPageSchema(nestedCustomScript)).toThrow(
      'customScript is not allowed in schema',
    );
  });
});
