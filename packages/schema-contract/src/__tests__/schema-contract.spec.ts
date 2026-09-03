import { describe, it, expect } from 'vitest';
import {
  CURRENT_DRAFT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  parsePageSchemaJson,
  validatePageSchemaValue,
  createCanonicalPageSchema,
  requireSupportedPageSchema,
  assertSupportedPageSchema,
  SchemaValidationError,
  UnsupportedSchemaVersionError,
  DEFAULT_SCHEMA_LIMITS,
  FORBIDDEN_LOGIC_KEYS,
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

  describe('M1a State declarations', () => {
    it('canonicalizes and deeply freezes logic.states without mutating the source', () => {
      const source = {
        ...validSchema,
        logic: {
          states: {
            count: 1,
            profile: { name: 'Ada', tags: ['admin'] },
          },
        },
      };

      const result = validatePageSchemaValue(source);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.logic?.states).toEqual({
        count: 1,
        profile: { name: 'Ada', tags: ['admin'] },
      });
      expect(result.value.logic).not.toBe(source.logic);
      expect(result.value.logic?.states).not.toBe(source.logic.states);
      expect(Object.isFrozen(result.value.logic)).toBe(true);
      expect(Object.isFrozen(result.value.logic?.states.profile)).toBe(true);
      expect(Object.isFrozen((result.value.logic?.states.profile as { tags: unknown }).tags)).toBe(
        true,
      );

      source.logic.states.profile.name = 'Grace';
      expect((result.value.logic?.states.profile as { name: string }).name).toBe('Ada');
    });

    it.each([
      ['logic must be an object', { logic: [] }, 'INVALID_LOGIC_OBJECT'],
      ['states must be an object', { logic: { states: [] } }, 'INVALID_STATES_OBJECT'],
      ['unknown logic fields fail closed', { logic: { state: {} } }, 'UNKNOWN_LOGIC_FIELD'],
      [
        'state keys must be identifiers',
        { logic: { states: { 'not-safe': 1 } } },
        'INVALID_STATE_KEY',
      ],
    ])('rejects %s', (_label, extension, expectedCode) => {
      const result = validatePageSchemaValue({ ...validSchema, ...extension });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === expectedCode)).toBe(true);
      }
    });

    it.each(FORBIDDEN_LOGIC_KEYS)('rejects the cross-runtime forbidden Logic Key %s', (key) => {
      const states = Object.create(null) as Record<string, unknown>;
      states[key] = 1;
      const result = validatePageSchemaValue({ ...validSchema, logic: { states } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'INVALID_STATE_KEY',
            path: ['logic', 'states', key],
          }),
        );
      }
    });

    it('keeps valid nested legacy State writes when no declarations exist', () => {
      const result = validatePageSchemaValue({
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Page',
            events: {
              onClick: [{ type: 'setValue', field: 'state.profile.name', value: 'Ada' }],
            },
          },
        },
      });

      expect(result.ok).toBe(true);
    });

    it.each([
      ['setValue nested path', { type: 'setValue', field: 'state.profile.name', value: 'Ada' }],
      ['setValue forbidden key', { type: 'setValue', field: 'state.toJSON', value: 1 }],
      [
        'apiCall forbidden result target',
        { type: 'apiCall', url: '/profile', resultTo: 'state.constructor' },
      ],
    ])('rejects an unsupported %s', (_label, action) => {
      const result = validatePageSchemaValue({
        schemaVersion: 0,
        rootId: 'root',
        logic: { states: {} },
        components: {
          root: { id: 'root', type: 'Page', events: { onClick: [action] } },
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'INVALID_STATE_TARGET')).toBe(true);
      }
    });

    it('applies the dedicated state entry budget before walking values', () => {
      const result = validatePageSchemaValue(
        {
          ...validSchema,
          logic: { states: { first: 1, second: 2 } },
        },
        { maxStateEntries: 1 },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'STATE_ENTRIES_BUDGET_EXCEEDED')).toBe(
          true,
        );
      }
    });

    it('counts nested state values against the shared JSON budget', () => {
      const result = validatePageSchemaValue(
        {
          ...validSchema,
          logic: { states: { profile: { name: 'Ada' } } },
        },
        { maxJsonNodes: 2 },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'SCHEMA_BUDGET_EXCEEDED')).toBe(true);
      }
    });

    it('keeps schemas without logic backward compatible', () => {
      const result = validatePageSchemaValue(validSchema);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.logic).toBeUndefined();
      }
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

  describe('Security Hardening: inherited accessors, symbols, non-enumerable fields, TOCTOU', () => {
    it('rejects inherited schemaVersion getter without executing it', () => {
      let getterRan = false;
      const proto = {
        get schemaVersion() {
          getterRan = true;
          return 0;
        },
      };
      const schema: Record<string, unknown> = Object.create(proto);
      schema.rootId = 'page_root';
      schema.components = {
        page_root: { id: 'page_root', type: 'Page', childrenIds: [] },
      };

      const result = validatePageSchemaValue(schema);
      expect(getterRan).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
      }
      expect(() => createCanonicalPageSchema(schema)).toThrow(SchemaValidationError);
    });

    it('rejects inherited component type/id getter without executing it', () => {
      let getterRan = false;
      const compProto = {
        get type() {
          getterRan = true;
          return 'Page';
        },
      };
      const comp: Record<string, unknown> = Object.create(compProto);
      comp.id = 'page_root';

      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: comp },
      };

      const result = validatePageSchemaValue(schema);
      expect(getterRan).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.issues.some(
            (i) =>
              i.code === 'INVALID_OBJECT_PROTOTYPE' && i.path.join('.') === 'components.page_root',
          ),
        ).toBe(true);
      }
    });

    it('rejects inherited action type getter without executing it', () => {
      let getterRan = false;
      const actionProto = {
        get type() {
          getterRan = true;
          return 'setValue';
        },
      };
      const action: Record<string, unknown> = Object.create(actionProto);
      action.field = 'state.count';
      action.value = 1;

      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', events: { onClick: [action] } },
        },
      };

      const result = validatePageSchemaValue(schema);
      expect(getterRan).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
      }
    });

    it('rejects accessor at props array index without executing it', () => {
      let getterRan = false;
      const arr: unknown[] = [];
      Object.defineProperty(arr, 0, {
        get() {
          getterRan = true;
          return 'dangerous';
        },
        enumerable: true,
        configurable: true,
      });
      arr.length = 1;

      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', props: { list: arr } },
        },
      };

      const result = validatePageSchemaValue(schema);
      expect(getterRan).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
      }
    });

    it('rejects accessor at ActionList index without executing it', () => {
      let getterRan = false;
      const actions: unknown[] = [];
      Object.defineProperty(actions, 0, {
        get() {
          getterRan = true;
          return { type: 'setValue', field: 'state.count', value: 1 };
        },
        enumerable: true,
        configurable: true,
      });
      actions.length = 1;

      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', events: { onClick: actions } },
        },
      };

      const result = validatePageSchemaValue(schema);
      expect(getterRan).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
      }
    });

    it('rejects Symbol-keyed fields on schema, component and action', () => {
      const sym = Symbol('injected');

      const schemaLevel: Record<string | symbol, unknown> = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: { id: 'page_root', type: 'Page' } },
      };
      schemaLevel[sym] = { evil: true };
      const r1 = validatePageSchemaValue(schemaLevel);
      expect(r1.ok).toBe(false);
      if (!r1.ok) {
        expect(r1.issues.some((i) => i.code === 'SYMBOL_PROPERTY_FORBIDDEN')).toBe(true);
      }

      const componentLevel = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page' } as Record<string | symbol, unknown>,
        },
      };
      (componentLevel.components.page_root as Record<string | symbol, unknown>)[sym] = 'evil';
      const r2 = validatePageSchemaValue(componentLevel);
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.issues.some((i) => i.code === 'SYMBOL_PROPERTY_FORBIDDEN')).toBe(true);
      }

      const actionLevel = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: {
            id: 'page_root',
            type: 'Page',
            events: {
              onClick: [
                { type: 'setValue', field: 'state.count', value: 1 } as Record<
                  string | symbol,
                  unknown
                >,
              ],
            },
          },
        },
      };
      const actionObj = (
        actionLevel.components.page_root.events as { onClick: Record<string | symbol, unknown>[] }
      ).onClick[0];
      actionObj[sym] = 'evil';
      const r3 = validatePageSchemaValue(actionLevel);
      expect(r3.ok).toBe(false);
      if (!r3.ok) {
        expect(r3.issues.some((i) => i.code === 'SYMBOL_PROPERTY_FORBIDDEN')).toBe(true);
      }
    });

    it('rejects non-enumerable unknown fields (fail-close)', () => {
      const schema: Record<string, unknown> = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: { id: 'page_root', type: 'Page' } },
      };
      Object.defineProperty(schema, 'hidden', {
        value: { evil: true },
        enumerable: false,
        writable: true,
        configurable: true,
      });
      const r1 = validatePageSchemaValue(schema);
      expect(r1.ok).toBe(false);
      if (!r1.ok) {
        expect(r1.issues.some((i) => i.code === 'UNKNOWN_SCHEMA_FIELD')).toBe(true);
      }

      const componentLevel = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: { id: 'page_root', type: 'Page' } },
      };
      Object.defineProperty(componentLevel.components.page_root, 'hidden', {
        value: 'evil',
        enumerable: false,
        writable: true,
        configurable: true,
      });
      const r2 = validatePageSchemaValue(componentLevel);
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.issues.some((i) => i.code === 'UNKNOWN_COMPONENT_FIELD')).toBe(true);
      }
    });

    it('rejects class instances as schema, component and action', () => {
      class EvilSchema {
        schemaVersion = 0;
        rootId = 'page_root';
        components = { page_root: { id: 'page_root', type: 'Page' } };
      }
      const r1 = validatePageSchemaValue(new EvilSchema());
      expect(r1.ok).toBe(false);
      if (!r1.ok) {
        expect(r1.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
      }

      class EvilComponent {
        id = 'page_root';
        type = 'Page';
      }
      const r2 = validatePageSchemaValue({
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: new EvilComponent() },
      });
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
      }

      class EvilAction {
        type = 'setValue';
        field = 'state.count';
        value = 1;
      }
      const r3 = validatePageSchemaValue({
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', events: { onClick: [new EvilAction()] } },
        },
      });
      expect(r3.ok).toBe(false);
      if (!r3.ok) {
        expect(r3.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
      }
    });

    it('result.value is a rebuilt deep-frozen object isolated from the original input (TOCTOU)', () => {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: [] },
        },
      };

      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const value = result.value;

      // 返回的是重建的新对象而非原始输入，且深度冻结
      expect(value).not.toBe(schema);
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.components.page_root)).toBe(true);

      // 深度变异原输入不影响 result.value
      (schema.components.page_root as Record<string, unknown>).injected = () => {};
      expect(
        Object.getOwnPropertyDescriptor(value.components.page_root as object, 'injected'),
      ).toBeUndefined();

      // 变异 result.value 直接抛错（冻结 + 严格模式）
      expect(() => {
        (value.components.page_root as Record<string, unknown>).newField = 1;
      }).toThrow();

      // 原输入被污染后，canonicalize 依然产出干净、可用的结果
      const canonical = createCanonicalPageSchema(value);
      expect(canonical.components.page_root).toBeDefined();
      expect(
        Object.getOwnPropertyDescriptor(canonical.components.page_root as object, 'injected'),
      ).toBeUndefined();
    });

    it('createCanonicalPageSchema fails closed on illegal values instead of silently dropping them', () => {
      // props 中含函数：必须抛错，而不是静默丢掉 bad 字段
      const evilProps = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', props: { bad: () => {} } },
        },
      };
      expect(() => createCanonicalPageSchema(evilProps)).toThrow(SchemaValidationError);

      // events 中结构非法的 action（缺必填字段）：必须抛错
      const evilAction = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: {
            id: 'page_root',
            type: 'Page',
            events: { onClick: [{ type: 'setValue' }] },
          },
        },
      };
      expect(() => createCanonicalPageSchema(evilAction)).toThrow(SchemaValidationError);

      // 被禁用的 action 类型
      const evilScript = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: {
            id: 'page_root',
            type: 'Page',
            events: { onClick: [{ type: 'customScript', code: 'alert(1)' }] },
          },
        },
      };
      expect(() => createCanonicalPageSchema(evilScript)).toThrow(SchemaValidationError);

      // 类实例
      class EvilSchema {
        schemaVersion = 0;
        rootId = 'page_root';
        components = { page_root: { id: 'page_root', type: 'Page' } };
      }
      expect(() => createCanonicalPageSchema(new EvilSchema())).toThrow(SchemaValidationError);

      // 非对象输入
      expect(() => createCanonicalPageSchema(null)).toThrow(SchemaValidationError);
      expect(() => createCanonicalPageSchema('not a schema')).toThrow(SchemaValidationError);
      expect(() => createCanonicalPageSchema(undefined)).toThrow(SchemaValidationError);
    });

    it('canonical objects contain no own property with an undefined value', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page' },
        },
      };

      const canonical = createCanonicalPageSchema(schema);
      const root = canonical.components.page_root as object;

      // 未提供的可选字段不应产生值为 undefined 的自有属性
      expect(Object.getOwnPropertyNames(root)).toEqual(['id', 'type']);
      for (const key of Object.getOwnPropertyNames(root)) {
        expect(Object.getOwnPropertyDescriptor(root, key)?.value).not.toBeUndefined();
      }

      // 顶层同样如此
      expect(Object.getOwnPropertyNames(canonical)).toEqual([
        'schemaVersion',
        'rootId',
        'components',
      ]);

      // 是纯 JSON 数据对象
      expect(JSON.parse(JSON.stringify(canonical))).toEqual(schema);
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

  describe('requireSupportedPageSchema (canonical-returning boundary)', () => {
    it('returns a rebuilt deep-frozen canonical object isolated from the input', () => {
      const canonical = requireSupportedPageSchema(validSchema);
      expect(canonical).not.toBe(validSchema);
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(canonical.rootId).toBe('page_root');
      expect(canonical.components.page_root).toBeDefined();
    });

    it('fails closed on unsupported version and invalid structure', () => {
      expect(() => requireSupportedPageSchema({ ...validSchema, schemaVersion: 999 })).toThrow(
        UnsupportedSchemaVersionError,
      );
      expect(() => requireSupportedPageSchema({ ...validSchema, rootId: '' })).toThrow(
        SchemaValidationError,
      );
      expect(() => requireSupportedPageSchema(null)).toThrow(SchemaValidationError);
    });
  });

  describe('Security Hardening R3: safe value formatting in error messages', () => {
    interface HookFlags {
      toString: number;
      valueOf: number;
      toPrimitive: number;
      constructorGetter: number;
    }

    /** 构造一个带全部转换钩子的"毒"对象：任何 String()/模板插值/constructor 读取都会被记录 */
    const createPoison = (): { poison: Record<string | symbol, unknown>; hooks: HookFlags } => {
      const hooks: HookFlags = {
        toString: 0,
        valueOf: 0,
        toPrimitive: 0,
        constructorGetter: 0,
      };
      const poison: Record<string | symbol, unknown> = {};
      Object.defineProperty(poison, 'toString', {
        value() {
          hooks.toString++;
          return 'evil';
        },
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(poison, 'valueOf', {
        value() {
          hooks.valueOf++;
          return 42;
        },
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(poison, Symbol.toPrimitive, {
        value() {
          hooks.toPrimitive++;
          return 'primitive';
        },
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(poison, 'constructor', {
        get() {
          hooks.constructorGetter++;
          return Object;
        },
        enumerable: true,
        configurable: true,
      });
      return { poison, hooks };
    };

    const expectHooksNeverRan = (hooks: HookFlags): void => {
      expect(hooks).toEqual({ toString: 0, valueOf: 0, toPrimitive: 0, constructorGetter: 0 });
    };

    it('never invokes conversion hooks when schemaVersion is an untrusted object', () => {
      const { poison, hooks } = createPoison();
      const schema = {
        schemaVersion: poison,
        rootId: 'page_root',
        components: { page_root: { id: 'page_root', type: 'Page' } },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true);
      expectHooksNeverRan(hooks);
    });

    it('never invokes conversion hooks for invalid childrenIds elements', () => {
      const { poison, hooks } = createPoison();
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: [poison] },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_CHILD_REFERENCE')).toBe(true);
      expectHooksNeverRan(hooks);
    });

    it('never invokes conversion hooks for invalid loop identifiers', () => {
      const { poison, hooks } = createPoison();
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: {
            id: 'page_root',
            type: 'Page',
            events: {
              onClick: [{ type: 'loop', over: 'items', itemVar: poison, actions: [] }],
            },
          },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_LOOP_IDENTIFIER')).toBe(true);
      expectHooksNeverRan(hooks);
    });

    it('never invokes conversion hooks from UnsupportedSchemaVersionError construction', () => {
      const { poison, hooks } = createPoison();
      const error = new UnsupportedSchemaVersionError(poison);
      expect(error.message).toContain('Unsupported schemaVersion');
      expectHooksNeverRan(hooks);
    });

    it('reports class instances via instanceof only, without reading constructor', () => {
      let constructorGetterRan = false;
      class EvilDate extends Date {}
      const evil = new EvilDate();
      Object.defineProperty(evil, 'constructor', {
        get() {
          constructorGetterRan = true;
          return EvilDate;
        },
        configurable: true,
      });
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', props: { when: evil } },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      const issue = result.issues.find((i) => i.code === 'CLASS_INSTANCE_FORBIDDEN');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Date');
      expect(constructorGetterRan).toBe(false);
    });
  });

  describe('Security Hardening R3: budget short-circuit & issue cap', () => {
    it('rejects oversized sparse props arrays with exactly one budget issue', () => {
      const sparse: unknown[] = [];
      sparse.length = 10_000;
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', props: { list: sparse } },
        },
      };
      const result = validatePageSchemaValue(schema, { maxJsonNodes: 100 });
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('SCHEMA_BUDGET_EXCEEDED');
    });

    it('rejects 2^32-2 length childrenIds without O(len) traversal', () => {
      const huge: string[] = [];
      huge.length = 4_294_967_294;
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', childrenIds: huge },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('CHILDREN_IDS_BUDGET_EXCEEDED');
    });

    it('rejects 2^32-2 length ActionList without O(len) traversal', () => {
      const huge: unknown[] = [];
      huge.length = 4_294_967_294;
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', events: { onClick: huge } },
        },
      };
      const result = validatePageSchemaValue(schema);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('ACTION_BUDGET_EXCEEDED');
    });

    it('fails immediately on component-count overflow without traversing components', () => {
      const components: Record<string, unknown> = {
        c0: { id: 'c0', type: 'Page' },
      };
      for (let i = 1; i <= 2000; i++) {
        components[`c${i}`] = {}; // 非法组件：若无短路会产生数千条额外 issue
      }
      const result = validatePageSchemaValue(
        { schemaVersion: 0, rootId: 'c0', components },
        { maxComponents: 10 },
      );
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('COMPONENT_BUDGET_EXCEEDED');
    });

    it('caps issue collection at maxIssues and aborts traversal', () => {
      const components: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        components[`c${i}`] = { id: `c${i}`, type: 'Div', rogue: 1 }; // UNKNOWN_COMPONENT_FIELD × 100
      }
      const result = validatePageSchemaValue(
        { schemaVersion: 0, rootId: 'c0', components },
        { maxIssues: 50 },
      );
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(50);
      expect(result.issues.every((i) => i.code === 'UNKNOWN_COMPONENT_FIELD')).toBe(true);
    });

    it('keeps the explicit State / JSON / issue budget defaults', () => {
      expect(DEFAULT_SCHEMA_LIMITS.maxStateEntries).toBe(200);
      expect(DEFAULT_SCHEMA_LIMITS.maxJsonNodes).toBe(25_000);
      expect(DEFAULT_SCHEMA_LIMITS.maxIssues).toBe(500);
    });
  });

  describe('Security Hardening R4: global issue sink, events budget & limits normalization', () => {
    it('maxIssues is a strict global cap across every validation phase', () => {
      // 单个多错误组件（5 类错误）在 maxIssues: 1 下只产生 1 条
      const r1 = validatePageSchemaValue(
        {
          schemaVersion: 0,
          rootId: 'page_root',
          components: {
            page_root: { id: '', type: '', props: 1, childrenIds: 1, events: 1 },
          },
        },
        { maxIssues: 1 },
      );
      expect(r1.ok).toBe(false);
      expect(r1.issues).toHaveLength(1);

      // 顶层 100 个未知字段在 maxIssues: 5 下只产生 5 条
      const schema: Record<string, unknown> = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: { page_root: { id: 'page_root', type: 'Page' } },
      };
      for (let i = 0; i < 100; i++) schema[`rogue${i}`] = 1;
      const r2 = validatePageSchemaValue(schema, { maxIssues: 5 });
      expect(r2.ok).toBe(false);
      expect(r2.issues).toHaveLength(5);
      expect(r2.issues.every((i) => i.code === 'UNKNOWN_SCHEMA_FIELD')).toBe(true);
    });

    it('caps topology (tree) issues through the same sink', () => {
      const components: Record<string, unknown> = {
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['c1'] },
        c2: { id: 'c2', type: 'Div', childrenIds: ['c1'] }, // c1 的第二个父 → MULTIPLE_PARENTS；c2 自身也是孤儿
        c1: { id: 'c1', type: 'Div' },
      };
      for (let i = 0; i < 50; i++) {
        components[`o${i}`] = { id: `o${i}`, type: 'Div' }; // 50 个孤儿节点
      }
      const result = validatePageSchemaValue(
        { schemaVersion: 0, rootId: 'page_root', components },
        { maxIssues: 10 },
      );
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(10);
      expect(result.issues.some((i) => i.code === 'MULTIPLE_PARENTS')).toBe(true);
      expect(result.issues.some((i) => i.code === 'ORPHANED_COMPONENT')).toBe(true);
    });

    it('rejects oversized events maps before traversal (maxEventBindings)', () => {
      const events: Record<string, unknown> = {};
      for (let i = 0; i < 50_000; i++) events[`e${i}`] = []; // 空 ActionList：不消耗 action/JSON 节点预算
      const schema = {
        schemaVersion: 0,
        rootId: 'page_root',
        components: {
          page_root: { id: 'page_root', type: 'Page', events },
        },
      };
      // 自定义预算与默认限制下都必须在 O(1) 预检阶段拒绝，绝不遍历 5 万个事件
      const r1 = validatePageSchemaValue(schema, { maxJsonNodes: 10 });
      expect(r1.ok).toBe(false);
      expect(r1.issues).toHaveLength(1);
      expect(r1.issues[0].code).toBe('EVENT_BINDINGS_BUDGET_EXCEEDED');

      const r2 = validatePageSchemaValue(schema);
      expect(r2.ok).toBe(false);
      expect(r2.issues.some((i) => i.code === 'EVENT_BINDINGS_BUDGET_EXCEEDED')).toBe(true);
    });

    it('rejects invalid custom limits instead of silently accepting them', () => {
      expect(() => validatePageSchemaValue(validSchema, { maxIssues: 0 })).toThrow(TypeError);
      expect(() => validatePageSchemaValue(validSchema, { maxIssues: Infinity })).toThrow(
        TypeError,
      );
      expect(() => validatePageSchemaValue(validSchema, { maxJsonNodes: NaN })).toThrow(TypeError);
      expect(() => validatePageSchemaValue(validSchema, { maxActionNodes: -1 })).toThrow(TypeError);
      expect(() => validatePageSchemaValue(validSchema, { maxComponents: 1.5 })).toThrow(TypeError);
      expect(() => parsePageSchemaJson('{}', { maxBytes: 10 ** 12 })).toThrow(TypeError);

      // 合法自定义限制仍然生效
      expect(validatePageSchemaValue(validSchema, { maxComponents: 1 }).ok).toBe(false);
      expect(validatePageSchemaValue(validSchema).ok).toBe(true);
    });

    it('keeps the explicit maxEventBindings default', () => {
      expect(DEFAULT_SCHEMA_LIMITS.maxEventBindings).toBe(200);
    });
  });
});
