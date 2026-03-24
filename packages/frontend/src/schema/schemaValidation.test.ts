import { describe, expect, it } from 'vitest';
import { validateAndAutoFixA2UISchema } from './schemaValidation';

describe('validateAndAutoFixA2UISchema', () => {
  const whitelist = ['Page', 'Button', 'Text'];

  it('accepts AI schema payloads with string version and missing ids after auto-fix', () => {
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

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.version).toBe(5);
    expect(result.data.components.root.id).toBe('root');
    expect(result.data.components['btn-submit'].id).toBe('btn-submit');
    expect(result.data.components['btn-submit'].props).toEqual({ children: '登录' });
  });
});
