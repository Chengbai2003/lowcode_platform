import { describe, expect, it } from 'vitest';
import { validateAndAutoFixA2UISchema } from '../schemaValidation';

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
