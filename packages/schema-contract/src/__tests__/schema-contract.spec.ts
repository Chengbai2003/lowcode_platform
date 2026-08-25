import { describe, it, expect } from 'vitest';
import {
  CURRENT_DRAFT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  parsePageSchemaJson,
  validatePageSchemaValue,
  createCanonicalPageSchema,
  assertSupportedPageSchema,
  SchemaValidationError,
  UnsupportedSchemaVersionError,
  type PageSchema,
} from '../index';

const validSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'page_root',
  components: {
    page_root: {
      id: 'page_root',
      type: 'Page',
      childrenIds: ['btn_1'],
    },
    btn_1: {
      id: 'btn_1',
      type: 'Button',
      props: { children: 'Click me' },
      events: {
        onClick: [
          {
            type: 'setValue',
            field: 'state.count',
            value: 1,
          },
          {
            type: 'if',
            condition: true,
            then: [
              {
                type: 'feedback',
                content: 'Success',
                level: 'success',
              },
            ],
          },
        ],
      },
      childrenIds: [],
    },
  },
};

describe('@lowcode-platform/schema-contract', () => {
  describe('Constants & Versioning', () => {
    it('defines CURRENT_DRAFT_SCHEMA_VERSION as 0', () => {
      expect(CURRENT_DRAFT_SCHEMA_VERSION).toBe(0);
      expect(SUPPORTED_SCHEMA_VERSIONS).toEqual([0]);
    });
  });

  describe('parsePageSchemaJson', () => {
    it('successfully parses valid page schema JSON', () => {
      const json = JSON.stringify(validSchema);
      const result = parsePageSchemaJson(json);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rootId).toBe('page_root');
      }
    });

    it('rejects non-string input', () => {
      const result = parsePageSchemaJson(123 as unknown as string);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe('INVALID_JSON_INPUT');
      }
    });

    it('rejects malformed JSON string', () => {
      const result = parsePageSchemaJson('{ invalid json }');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe('JSON_PARSE_ERROR');
      }
    });

    it('rejects schema exceeding max size bytes', () => {
      const json = JSON.stringify(validSchema);
      const result = parsePageSchemaJson(json, 10); // max 10 bytes
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe('SCHEMA_SIZE_EXCEEDED');
      }
    });
  });

  describe('validatePageSchemaValue', () => {
    it('validates a correct PageSchema', () => {
      const result = validatePageSchemaValue(validSchema);
      expect(result.ok).toBe(true);
    });

    it('rejects non-object schema', () => {
      const result = validatePageSchemaValue('string');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues[0].code).toBe('INVALID_SCHEMA_OBJECT');
      }
    });

    it('rejects missing schemaVersion', () => {
      const schema = { ...validSchema } as Record<string, unknown>;
      delete schema.schemaVersion;
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'SCHEMA_VERSION_REQUIRED')).toBe(true);
      }
    });

    it('rejects unsupported schemaVersion', () => {
      const schema = { ...validSchema, schemaVersion: 999 };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true);
      }
    });

    it('rejects missing rootId or missing root node in components', () => {
      const schema1 = { ...validSchema, rootId: '' };
      const result1 = validatePageSchemaValue(schema1);
      expect(result1.ok).toBe(false);
      if (!result1.ok) {
        expect(result1.issues.some((i) => i.code === 'ROOT_ID_REQUIRED')).toBe(true);
      }

      const schema2 = { ...validSchema, rootId: 'non_existent' };
      const result2 = validatePageSchemaValue(schema2);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.issues.some((i) => i.code === 'ROOT_NODE_MISSING')).toBe(true);
      }
    });

    it('rejects component id mismatch', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'wrong_id',
            type: 'Button',
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'COMPONENT_ID_MISMATCH')).toBe(true);
      }
    });

    it('rejects missing child reference and duplicate child reference', () => {
      const missingChildSchema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          page_root: {
            id: 'page_root',
            type: 'Page',
            childrenIds: ['non_existent_child'],
          },
        },
      };
      const result1 = validatePageSchemaValue(missingChildSchema);
      expect(result1.ok).toBe(false);
      if (!result1.ok) {
        expect(result1.issues.some((i) => i.code === 'MISSING_CHILD_REFERENCE')).toBe(true);
      }

      const dupChildSchema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          page_root: {
            id: 'page_root',
            type: 'Page',
            childrenIds: ['btn_1', 'btn_1'],
          },
        },
      };
      const result2 = validatePageSchemaValue(dupChildSchema);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.issues.some((i) => i.code === 'DUPLICATE_CHILD_REFERENCE')).toBe(true);
      }
    });

    it('rejects multiple parents for a component', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: ['container1', 'container2'] },
          container1: { id: 'container1', type: 'Div', childrenIds: ['shared_btn'] },
          container2: { id: 'container2', type: 'Div', childrenIds: ['shared_btn'] },
          shared_btn: { id: 'shared_btn', type: 'Button', childrenIds: [] },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'MULTIPLE_PARENTS')).toBe(true);
      }
    });

    it('rejects component cycle', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'node_a',
        components: {
          node_a: { id: 'node_a', type: 'Div', childrenIds: ['node_b'] },
          node_b: { id: 'node_b', type: 'Div', childrenIds: ['node_c'] },
          node_c: { id: 'node_c', type: 'Div', childrenIds: ['node_a'] },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'COMPONENT_CYCLE')).toBe(true);
      }
    });

    it('rejects orphaned component', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: [] },
          orphan_btn: { id: 'orphan_btn', type: 'Button', childrenIds: [] },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ORPHANED_COMPONENT')).toBe(true);
      }
    });

    it('allows detached hidden data node (Div, visible: false, initialValue)', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: [] },
          hidden_data: {
            id: 'hidden_data',
            type: 'Div',
            props: { visible: false, initialValue: { foo: 'bar' } },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(true);
    });

    it('rejects customScript action and customScript in props', () => {
      const schemaWithCustomScriptAction = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: {
              onClick: [{ type: 'customScript', code: 'alert(1)' }],
            },
            childrenIds: [],
          },
        },
      };
      const result1 = validatePageSchemaValue(schemaWithCustomScriptAction);
      expect(result1.ok).toBe(false);
      if (!result1.ok) {
        expect(result1.issues.some((i) => i.code === 'FORBIDDEN_CUSTOM_SCRIPT')).toBe(true);
      }

      const schemaWithCustomScriptProp = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            props: { action: { type: 'customScript', code: 'alert(1)' } },
            childrenIds: [],
          },
        },
      };
      const result2 = validatePageSchemaValue(schemaWithCustomScriptProp);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.issues.some((i) => i.code === 'FORBIDDEN_CUSTOM_SCRIPT_IN_PROPS')).toBe(
          true,
        );
      }
    });

    it('rejects unsupported action type', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: {
              onClick: [{ type: 'unknown_magic_action' }],
            },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'UNSUPPORTED_ACTION_TYPE')).toBe(true);
      }
    });

    it('rejects accessor properties (getter/setter) on schema object', () => {
      const badObj = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {},
        get malicious() {
          return 'hacked';
        },
      };
      const result = validatePageSchemaValue(badObj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
      }
    });
  });

  describe('createCanonicalPageSchema', () => {
    it('creates a safe, deepFrozen canonical PageSchema', () => {
      const canonical = createCanonicalPageSchema(validSchema);
      expect(canonical.rootId).toBe('page_root');
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(Object.isFrozen(canonical.components)).toBe(true);
      expect(Object.isFrozen(canonical.components.btn_1)).toBe(true);
      expect(Object.isFrozen(canonical.components.btn_1.props)).toBe(true);

      // Mutating frozen object throws in strict mode
      expect(() => {
        (canonical as any).rootId = 'modified';
      }).toThrow();
      expect(() => {
        (canonical.components.btn_1.props as any).children = 'modified';
      }).toThrow();
    });
  });

  describe('assertSupportedPageSchema', () => {
    it('does not throw for valid schema', () => {
      expect(() => assertSupportedPageSchema(validSchema)).not.toThrow();
    });

    it('throws UnsupportedSchemaVersionError when schemaVersion is unsupported', () => {
      const schema = { ...validSchema, schemaVersion: 999 };
      expect(() => assertSupportedPageSchema(schema)).toThrow(UnsupportedSchemaVersionError);
    });

    it('throws SchemaValidationError when schema structure is invalid', () => {
      const schema = { ...validSchema, rootId: '' };
      expect(() => assertSupportedPageSchema(schema)).toThrow(SchemaValidationError);
    });
  });
});
