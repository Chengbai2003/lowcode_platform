import { BadRequestException } from '@nestjs/common';
import { requireValidPageSchema } from './schema-validation';

interface TestComponent {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  childrenIds: string[];
  events?: Record<string, unknown>;
}

function createSchema(): {
  schemaVersion: 0;
  rootId: string;
  components: Record<string, TestComponent>;
} {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['child'] },
      child: { id: 'child', type: 'Div', childrenIds: [] },
    },
  };
}

describe('requireValidPageSchema (Contract HTTP adapter)', () => {
  it('returns a canonical deep-frozen schema for valid input', () => {
    const input: unknown = createSchema();
    const canonical = requireValidPageSchema(input);

    expect(canonical).not.toBe(input);
    expect(canonical.rootId).toBe('root');
    expect(canonical.schemaVersion).toBe(0);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.components.root)).toBe(true);

    // 校验后变异原输入不影响 canonical 结果（TOCTOU 隔离）
    (input as { components: Record<string, unknown> }).components.injected = {};
    expect(canonical.components.injected).toBeUndefined();
  });

  it('rejects missing and mismatched component ids as 400', () => {
    const missingId = createSchema();
    delete missingId.components.child.id;
    expect(() => requireValidPageSchema(missingId)).toThrow(BadRequestException);
    expect(() => requireValidPageSchema(missingId)).toThrow(/id is required/);

    const mismatchedId = createSchema();
    mismatchedId.components.child.id = 'other';
    expect(() => requireValidPageSchema(mismatchedId)).toThrow(/must match its key/);
  });

  it('rejects duplicate children, cycles, multiple parents, and ordinary orphans', () => {
    const duplicateChild = createSchema();
    duplicateChild.components.root.childrenIds = ['child', 'child'];
    expect(() => requireValidPageSchema(duplicateChild)).toThrow(/more than once/);

    const cycle = createSchema();
    cycle.components.child.childrenIds = ['root'];
    expect(() => requireValidPageSchema(cycle)).toThrow(/component cycle/);

    const multipleParents = createSchema();
    multipleParents.components.other = { id: 'other', type: 'Div', childrenIds: ['child'] };
    multipleParents.components.root.childrenIds = ['child', 'other'];
    expect(() => requireValidPageSchema(multipleParents)).toThrow(/multiple parents/);

    const orphan = createSchema();
    orphan.components.orphan = { id: 'orphan', type: 'Div', childrenIds: [] };
    expect(() => requireValidPageSchema(orphan)).toThrow(/orphaned/);
  });

  it('strictly rejects detached hidden data nodes (no component-library knowledge)', () => {
    const schema = createSchema();
    schema.components.data = {
      id: 'data',
      type: 'Div',
      props: { visible: false, initialValue: { status: 'draft' } },
      childrenIds: [],
    };

    expect(() => requireValidPageSchema(schema)).toThrow(BadRequestException);
  });

  it('rejects unknown event actions and nested customScript', () => {
    const unknownAction = createSchema();
    unknownAction.components.child.events = { onClick: [{ type: 'unknown' }] };
    expect(() => requireValidPageSchema(unknownAction)).toThrow(/Unsupported action type/);

    const nestedCustomScript = createSchema();
    nestedCustomScript.components.child.events = {
      onClick: [{ type: 'if', then: [{ type: 'customScript', code: 'alert(1)' }] }],
    };
    expect(() => requireValidPageSchema(nestedCustomScript)).toThrow(/customScript/);
  });

  it('rejects prototype pollution keys', () => {
    for (const protoKey of ['toString', 'constructor', '__proto__']) {
      // rootId 是原型键且没有对应组件
      const badRoot: unknown = JSON.parse(
        `{"schemaVersion":0,"rootId":"${protoKey}","components":{}}`,
      );
      expect(() => requireValidPageSchema(badRoot)).toThrow(BadRequestException);

      // childrenIds 引用原型键且没有对应组件
      const badChild: unknown = JSON.parse(
        `{"schemaVersion":0,"rootId":"root","components":{"root":{"id":"root","type":"Page","childrenIds":["${protoKey}"]},"child":{"id":"child","type":"Div","childrenIds":[]}}}`,
      );
      if (protoKey === '__proto__') {
        const parsed: any = JSON.parse(
          '{"schemaVersion":0,"rootId":"root","components":{"root":{"id":"root","type":"Page","childrenIds":["__proto__"]}}}',
        );
        parsed.components.child = { id: 'child', type: 'Div', childrenIds: [] };
        expect(() => requireValidPageSchema(parsed)).toThrow(/references missing child/);
      } else {
        expect(() => requireValidPageSchema(badChild)).toThrow(/references missing child/);
      }
    }
  });

  it('rejects BigInt props as 400', () => {
    const schema: unknown = createSchema();
    (schema as { components: Record<string, TestComponent> }).components.root.props = {
      value: BigInt(1),
    };
    expect(() => requireValidPageSchema(schema)).toThrow(BadRequestException);
  });

  it('rejects unsupported schemaVersion as 400', () => {
    const schema: unknown = { ...createSchema(), schemaVersion: 999 };
    expect(() => requireValidPageSchema(schema)).toThrow(/schemaVersion/i);
  });

  it('keeps a moderate chain valid and rejects oversized schemas without stack overflow', () => {
    // 30 层链式拓扑在默认预算内合法
    const depth = 30;
    const components: Record<string, TestComponent> = {};
    for (let i = 0; i < depth; i++) {
      const id = `n${i}`;
      const next = i + 1 < depth ? `n${i + 1}` : null;
      components[id] = { id, type: 'Div', childrenIds: next ? [next] : [] };
    }
    const small = { schemaVersion: 0 as const, rootId: 'n0', components };
    expect(() => requireValidPageSchema(small)).not.toThrow();

    // 8000 节点超出默认预算：确定性快速失败（测试本身能完成即证明无栈溢出）
    const bigDepth = 8000;
    const bigComponents: Record<string, TestComponent> = {};
    for (let i = 0; i < bigDepth; i++) {
      const id = `n${i}`;
      const next = i + 1 < bigDepth ? `n${i + 1}` : null;
      bigComponents[id] = { id, type: 'Div', childrenIds: next ? [next] : [] };
    }
    const big = { schemaVersion: 0 as const, rootId: 'n0', components: bigComponents };
    expect(() => requireValidPageSchema(big)).toThrow(BadRequestException);
  });
});
