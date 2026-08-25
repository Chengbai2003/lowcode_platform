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

  it('rejects prototype pollution keys', () => {
    for (const protoKey of ['toString', 'constructor', '__proto__']) {
      // rootId is prototype key without own component
      const badRoot: any = JSON.parse(`{"rootId":"${protoKey}","components":{}}`);
      expect(() => assertValidPageSchema(badRoot)).toThrow('does not exist in components');

      // child reference is prototype key without own component
      const badChild: any = JSON.parse(
        `{"rootId":"root","components":{"root":{"id":"root","type":"Page","childrenIds":["${protoKey}"]},"child":{"id":"child","type":"Div","childrenIds":[]}}}`,
      );
      if (protoKey === '__proto__') {
        // JSON.parse for __proto__ as key needs explicit own property to avoid prototype assignment quirk
        // Ensure we test that without own __proto__ it is rejected
        const parsed: any = JSON.parse(
          '{"rootId":"root","components":{"root":{"id":"root","type":"Page","childrenIds":["__proto__"]}}}',
        );
        parsed.components.child = { id: 'child', type: 'Div', childrenIds: [] };
        expect(() => assertValidPageSchema(parsed)).toThrow('references missing child');
      } else {
        expect(() => assertValidPageSchema(badChild)).toThrow('references missing child');
      }
    }
  });

  it('handles BigInt serialization as 400', () => {
    const schema: any = createSchema();
    schema.components.root.props = { value: BigInt(1) };
    expect(() => assertValidPageSchema(schema)).toThrow('JSON serializable');
  });

  it('handles 8000-node deep chain without stack overflow', () => {
    const depth = 8000;
    const components: Record<string, TestComponent> = {};
    for (let i = 0; i < depth; i++) {
      const id = `n${i}`;
      const next = i + 1 < depth ? `n${i + 1}` : null;
      components[id] = {
        id,
        type: 'Div',
        childrenIds: next ? [next] : [],
      };
    }
    const schema = { rootId: 'n0', components };
    const serialized = JSON.stringify(schema);
    expect(Buffer.byteLength(serialized, 'utf-8')).toBeLessThan(1024 * 1024);
    expect(() => assertValidPageSchema(schema)).not.toThrow();
  });
});
