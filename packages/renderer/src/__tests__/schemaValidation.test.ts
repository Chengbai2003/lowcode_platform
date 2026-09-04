import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import {
  safeValidateA2UISchema,
  validateA2UISchema,
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '../schemaValidation';

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

describe('validateAndAutoFixA2UISchema', () => {
  const whitelist = ['Page', 'Button', 'Text'];

  it('rejects AI schema payloads carrying legacy version fields (fail-close)', () => {
    const result = validateAndAutoFixA2UISchema(
      {
        version: '5',
        rootId: 'root',
        components: {
          root: {
            type: 'Page',
            childrenIds: ['btn-submit'],
          },
          'btn-submit': {
            type: 'Button',
            props: {
              content: '登录',
            },
          },
        },
      },
      whitelist,
    );

    // AutoFix 不迁移版本；遗留 version 字段必须被 Contract 校验拒绝
    expect(result.success).toBe(false);
  });

  it('accepts AI schema payloads with schemaVersion: 0 and missing ids after auto-fix', () => {
    const result = validateAndAutoFixA2UISchema(
      {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            type: 'Page',
            childrenIds: ['btn-submit'],
          },
          'btn-submit': {
            type: 'Button',
            props: {
              content: '登录',
            },
          },
        },
      },
      whitelist,
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.schemaVersion).toBe(0);
    expect(result.data.components.root.id).toBe('root');
    expect(result.data.components['btn-submit'].id).toBe('btn-submit');
    expect(result.data.components['btn-submit'].props).toEqual({ children: '登录' });
  });
});

describe('schemaValidation structured diagnostics fidelity', () => {
  const whitelist = ['Page', 'Button', 'Text'];

  const baseSchema = {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: [],
      },
    },
  };

  it('preserves COMPUTED_REFERENCE_MISSING code, path, and message', () => {
    const schema = {
      ...baseSchema,
      logic: {
        computed: {
          total: 'state.missingState + 1',
        },
      },
    };

    const result = safeValidateA2UISchema(schema);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    const issue = result.error.issues[0];
    expect(issue.code).toBe('COMPUTED_REFERENCE_MISSING');
    expect(issue.path).toEqual(['logic', 'computed', 'total']);
    expect(typeof issue.message).toBe('string');
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('preserves COMPUTED_CYCLE code, path, and message', () => {
    const schema = {
      ...baseSchema,
      logic: {
        computed: {
          a: 'computed.b + 1',
          b: 'computed.a + 1',
        },
      },
    };

    const result = safeValidateA2UISchema(schema);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    const issue = result.error.issues[0];
    expect(issue.code).toBe('COMPUTED_CYCLE');
    expect(issue.path).toEqual(['logic', 'computed']);
    expect(typeof issue.message).toBe('string');
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('preserves illegal expression code, path, and message', () => {
    const schema = {
      ...baseSchema,
      logic: {
        computed: {
          total: '1 +',
        },
      },
    };

    const result = safeValidateA2UISchema(schema);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    const issue = result.error.issues[0];
    expect(issue.code).toBe('COMPUTED_EXPRESSION_PARSE_ERROR');
    expect(issue.path).toEqual(['logic', 'computed', 'total']);
    expect(typeof issue.message).toBe('string');
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('preserves budget code COMPUTED_EXPRESSION_TOO_LONG code, path, and message', () => {
    const schema = {
      ...baseSchema,
      logic: {
        computed: {
          total: `'${'a'.repeat(10001)}'`,
        },
      },
    };

    const result = safeValidateA2UISchema(schema);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    const issue = result.error.issues[0];
    expect(issue.code).toBe('COMPUTED_EXPRESSION_TOO_LONG');
    expect(issue.path).toEqual(['logic', 'computed', 'total']);
    expect(typeof issue.message).toBe('string');
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it('preserves adapter UNKNOWN_COMPONENT_TYPE code, path, and message in whitelist validation', () => {
    const schema = {
      ...baseSchema,
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['custom-widget'],
        },
        'custom-widget': {
          id: 'custom-widget',
          type: 'UnregisteredWidget',
        },
      },
    };

    const result = validateA2UISchemaWithWhitelist(schema, whitelist);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toHaveLength(1);
    const issue = result.error.issues[0];
    expect(issue.code).toBe('UNKNOWN_COMPONENT_TYPE');
    expect(issue.path).toEqual(['components', 'custom-widget', 'type']);
    expect(issue.message).toContain('UnregisteredWidget');
  });
});

describe('M1a-3 / C2.1 Renderer validator conformance against unified fixture', () => {
  it('covers exactly 9 negative cases in the conformance fixture', () => {
    expect(negativeCaseEntries).toHaveLength(9);
  });

  it('returns canonical deep-frozen schema matching expected.canonicalLogic for main schema', () => {
    const result = safeValidateA2UISchema(conformanceFixture.schema);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.logic)).toBe(true);
    expect(result.data.logic).toEqual(conformanceFixture.expected.canonicalLogic);

    const directCanonical = validateA2UISchema(conformanceFixture.schema);
    expect(Object.isFrozen(directCanonical)).toBe(true);
    expect(directCanonical.logic).toEqual(conformanceFixture.expected.canonicalLogic);
  });

  it('accepts legacySchema without logic', () => {
    const result = safeValidateA2UISchema(conformanceFixture.legacySchema);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.schemaVersion).toBe(0);
    expect(Object.isFrozen(result.data)).toBe(true);

    const directLegacy = validateA2UISchema(conformanceFixture.legacySchema);
    expect(directLegacy.schemaVersion).toBe(0);
    expect(Object.isFrozen(directLegacy)).toBe(true);
  });

  it.each(negativeCaseEntries)(
    'rejects negative case "%s" with exact expectedCode and expectedPath',
    (_caseName, testCase) => {
      const result = safeValidateA2UISchema(testCase.schema);
      expect(result.success).toBe(false);
      if (result.success) return;

      const matched = result.error.issues.find((issue) => issue.code === testCase.expectedCode);
      expect(matched).toBeDefined();
      expect(matched?.path).toEqual(testCase.expectedPath);

      expect(() => validateA2UISchema(testCase.schema)).toThrow();
    },
  );
});
