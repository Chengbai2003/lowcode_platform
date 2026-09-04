import { describe, expect, it } from 'vitest';
import {
  safeValidateA2UISchema,
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '../schemaValidation';

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
