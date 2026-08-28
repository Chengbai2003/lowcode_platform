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
  DEFAULT_SCHEMA_LIMITS,
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

    it('defines 1 MiB maxBytes default limit', () => {
      expect(DEFAULT_SCHEMA_LIMITS.maxBytes).toBe(1024 * 1024);
    });
  });

  describe('P1-1: Unsafe Value & Accessor Inspection', () => {
    it('rejects top-level getter without executing it', () => {
      let getterCalled = false;
      const badObj = {
        get schemaVersion() {
          getterCalled = true;
          return 0;
        },
        rootId: 'page_root',
        components: {},
      };
      const result = validatePageSchemaValue(badObj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
      }
      expect(getterCalled).toBe(false);
    });

    it('rejects nested getter inside props without executing it', () => {
      let getterCalled = false;
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            props: {
              get dynamicProp() {
                getterCalled = true;
                return 'dangerous';
              },
            },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
      }
      expect(getterCalled).toBe(false);
    });

    it('rejects non-JSON values: function, Symbol, BigInt, Date, RegExp, NaN, Infinity', () => {
      const cases = [
        { label: 'function', val: () => 123, expectedCode: 'FUNCTION_FORBIDDEN' },
        { label: 'symbol', val: Symbol('test'), expectedCode: 'SYMBOL_FORBIDDEN' },
        { label: 'bigint', val: BigInt(123), expectedCode: 'BIGINT_FORBIDDEN' },
        { label: 'Date', val: new Date(), expectedCode: 'CLASS_INSTANCE_FORBIDDEN' },
        { label: 'RegExp', val: /abc/, expectedCode: 'CLASS_INSTANCE_FORBIDDEN' },
        { label: 'NaN', val: NaN, expectedCode: 'NON_FINITE_NUMBER' },
        { label: 'Infinity', val: Infinity, expectedCode: 'NON_FINITE_NUMBER' },
      ];

      for (const { label, val, expectedCode } of cases) {
        const schema = {
          ...validSchema,
          components: {
            ...validSchema.components,
            btn_1: {
              id: 'btn_1',
              type: 'Button',
              props: { [label]: val },
              childrenIds: [],
            },
          },
        };
        const result = validatePageSchemaValue(schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.issues.some((i) => i.code === expectedCode)).toBe(true);
        }
      }
    });

    it('rejects sparse arrays', () => {
      const sparseArray: unknown[] = [1, 2];
      sparseArray[5] = 10; // sparse array with empty holes
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            props: { items: sparseArray },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'SPARSE_ARRAY_FORBIDDEN')).toBe(true);
      }
    });

    it('detects circular references in props without stack overflow', () => {
      const circularProps: Record<string, unknown> = { title: 'hello' };
      circularProps.self = circularProps;

      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            props: circularProps,
            childrenIds: [],
          },
        },
      };

      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'CIRCULAR_REFERENCE')).toBe(true);
      }
    });
  });

  describe('P1-2: Action Payload Exhaustive Validation', () => {
    it('rejects empty/incomplete actions missing required fields', () => {
      const invalidActions = [
        { action: { type: 'setValue' }, expectedCode: 'ACTION_FIELD_REQUIRED' },
        { action: { type: 'if' }, expectedCode: 'ACTION_CONDITION_REQUIRED' },
        { action: { type: 'loop' }, expectedCode: 'ACTION_OVER_REQUIRED' },
        { action: { type: 'navigate' }, expectedCode: 'ACTION_TO_REQUIRED' },
        { action: { type: 'dialog' }, expectedCode: 'INVALID_DIALOG_KIND' },
        { action: { type: 'feedback' }, expectedCode: 'ACTION_CONTENT_REQUIRED' },
        { action: { type: 'log' }, expectedCode: 'ACTION_VALUE_REQUIRED' },
        { action: { type: 'apiCall' }, expectedCode: 'ACTION_URL_REQUIRED' },
      ];

      for (const { action, expectedCode } of invalidActions) {
        const schema = {
          ...validSchema,
          components: {
            ...validSchema.components,
            btn_1: {
              id: 'btn_1',
              type: 'Button',
              events: { onClick: [action] },
              childrenIds: [],
            },
          },
        };
        const result = validatePageSchemaValue(schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.issues.some((i) => i.code === expectedCode)).toBe(true);
        }
      }
    });

    it('rejects unknown fields on actions (fail-close)', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: {
              onClick: [
                {
                  type: 'setValue',
                  field: 'state.count',
                  value: 1,
                  unrecognizedField: 'malicious',
                },
              ],
            },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'UNKNOWN_ACTION_FIELD')).toBe(true);
      }
    });

    it('rejects invalid action enum values and invalid loop identifiers', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: {
              onClick: [
                {
                  type: 'loop',
                  over: [1, 2],
                  itemVar: 'eval', // unsafe keyword identifier
                  actions: [],
                },
              ],
            },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'INVALID_LOOP_IDENTIFIER')).toBe(true);
      }
    });

    it('rejects loop itemVar and indexVar collision', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: {
              onClick: [
                {
                  type: 'loop',
                  over: [1, 2],
                  itemVar: 'item',
                  indexVar: 'item',
                  actions: [],
                },
              ],
            },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'LOOP_VAR_COLLISION')).toBe(true);
      }
    });
  });

  describe('P1-3: __proto__ Prototype Pollution Defense', () => {
    it('preserves __proto__ keys without polluting Object.prototype', () => {
      const initialProtoPolluted = (Object.prototype as any).polluted;
      expect(initialProtoPolluted).toBeUndefined();

      const schemaWithProto = JSON.parse(
        JSON.stringify({
          schemaVersion: 0,
          rootId: '__proto__',
          components: {
            ['__proto__']: {
              id: '__proto__',
              type: 'Div',
              props: {
                ['__proto__']: 'safe_value',
                normal: 123,
              },
              childrenIds: [],
            },
          },
        }),
      );

      const result = validatePageSchemaValue(schemaWithProto);
      expect(result.ok).toBe(true);

      const canonical = createCanonicalPageSchema(schemaWithProto as PageSchema);
      expect(canonical.rootId).toBe('__proto__');
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).normal).toBeUndefined();
      expect((Object.prototype as any).safe_value).toBeUndefined();
    });
  });

  describe('P1-4: Strict Orphan Node Rejection (No Component Knowledge)', () => {
    it('strictly rejects orphaned components including Div with hidden flags', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: [] },
          hidden_div: {
            id: 'hidden_div',
            type: 'Div',
            props: { visible: false, initialValue: { foo: 'bar' } },
            childrenIds: [],
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ORPHANED_COMPONENT')).toBe(true);
      }
    });
  });

  describe('P1-5: Fail-close on Unknown Schema/Component Fields', () => {
    it('rejects unknown top-level schema fields', () => {
      const schema = {
        ...validSchema,
        unexpectedTopField: 'bad',
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'UNKNOWN_SCHEMA_FIELD')).toBe(true);
      }
    });

    it('rejects unknown component fields', () => {
      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            childrenIds: [],
            unknownComponentProp: 'illegal',
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'UNKNOWN_COMPONENT_FIELD')).toBe(true);
      }
    });
  });

  describe('P1-6: Budget & Limits Enforcement', () => {
    it('rejects schema exceeding max components limit', () => {
      const result = validatePageSchemaValue(validSchema, { maxComponents: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'COMPONENT_BUDGET_EXCEEDED')).toBe(true);
      }
    });

    it('rejects action nesting exceeding maxActionDepth', () => {
      const deepAction = {
        type: 'if',
        condition: true,
        then: [
          {
            type: 'if',
            condition: true,
            then: [
              {
                type: 'if',
                condition: true,
                then: [{ type: 'log', value: 'deep' }],
              },
            ],
          },
        ],
      };

      const schema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          btn_1: {
            id: 'btn_1',
            type: 'Button',
            events: { onClick: [deepAction] },
            childrenIds: [],
          },
        },
      };

      const result = validatePageSchemaValue(schema, { maxActionDepth: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACTION_DEPTH_EXCEEDED')).toBe(true);
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
