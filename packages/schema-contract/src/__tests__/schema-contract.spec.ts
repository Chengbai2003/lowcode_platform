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
});
