import { describe, it, expect } from 'vitest';
import { parseAndEvaluate } from '../executor/parser';

describe('expression context aliases', () => {
  it('aliases data keys to top-level when safe', () => {
    const context = {
      data: {
        loginForm: {
          username: 'admin',
        },
      },
    };

    expect(parseAndEvaluate('{{ loginForm.username }}', context)).toBe('admin');
  });

  it('does not override existing context keys', () => {
    const context = {
      loginForm: {
        username: 'fromContext',
      },
      data: {
        loginForm: {
          username: 'fromData',
        },
      },
    };

    expect(parseAndEvaluate('{{ loginForm.username }}', context)).toBe('fromContext');
  });

  it('keeps reserved context keys intact', () => {
    const context = {
      user: {
        name: 'ctx-user',
      },
      data: {
        user: {
          name: 'data-user',
        },
      },
    };

    expect(parseAndEvaluate('{{ user.name }}', context)).toBe('ctx-user');
  });
});
