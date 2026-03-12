import { describe, expect, it } from 'vitest';
import {
  createDefaultFormRule,
  sanitizeExpressionValue,
  sanitizeFormRulesValue,
  sanitizeJsonValue,
  sanitizeSlotValue,
  sanitizeTableColumnsValue,
} from './complexValueUtils';

describe('sanitizeTableColumnsValue', () => {
  it('returns fallback template for non-array values', () => {
    const result = sanitizeTableColumnsValue('not-json');

    expect(result).toEqual([{ title: '列1', dataIndex: 'col1', key: 'col1' }]);
  });

  it('returns cloned fallback for null/undefined input', () => {
    const fallback = [{ title: '姓名', dataIndex: 'name', key: 'name' }];
    const result = sanitizeTableColumnsValue(undefined, fallback);

    expect(result).toEqual(fallback);
    expect(result).not.toBe(fallback);
    expect(result[0]).not.toBe(fallback[0]);
  });

  it('parses json string and normalizes invalid fields', () => {
    const result = sanitizeTableColumnsValue(
      '[{"title":"","dataIndex":"name","width":"120","align":"center"}]',
    );

    expect(result).toEqual([
      {
        title: '列1',
        dataIndex: 'name',
        key: 'name',
        width: 120,
        align: 'center',
      },
    ]);
  });

  it('keeps large arrays intact', () => {
    const largeColumns = Array.from({ length: 1500 }, (_, index) => ({
      title: `列${index + 1}`,
      dataIndex: `col${index + 1}`,
      key: `col${index + 1}`,
    }));
    const result = sanitizeTableColumnsValue(largeColumns);

    expect(result).toHaveLength(1500);
    expect(result[1499]).toMatchObject({
      title: '列1500',
      dataIndex: 'col1500',
      key: 'col1500',
    });
  });
});

describe('sanitizeFormRulesValue', () => {
  it('falls back to empty array on invalid value', () => {
    const result = sanitizeFormRulesValue('invalid-json');

    expect(result).toEqual([]);
  });

  it('normalizes trigger/type/message fields', () => {
    const result = sanitizeFormRulesValue([
      {
        required: true,
        message: 123,
        type: ' email ',
        trigger: 'invalid',
      },
    ]);

    expect(result).toEqual([
      {
        required: true,
        message: '',
        type: 'email',
        trigger: 'onChange',
      },
    ]);
  });

  it('creates default rule template', () => {
    expect(createDefaultFormRule()).toEqual({
      required: false,
      message: '',
      type: undefined,
      trigger: 'onChange',
    });
  });
});

describe('sanitizeJsonValue', () => {
  it('falls back when template is undefined and json is invalid', () => {
    const result = sanitizeJsonValue('invalid-json', undefined);
    expect(result).toBeUndefined();
  });

  it('falls back to template when json type mismatch', () => {
    const fallback = { span: 6 };
    const result = sanitizeJsonValue('[]', fallback);
    expect(result).toEqual(fallback);
  });

  it('parses json string by template type', () => {
    expect(sanitizeJsonValue('true', false)).toBe(true);
    expect(sanitizeJsonValue('12', 0)).toBe(12);
    expect(sanitizeJsonValue('["a"]', [])).toEqual(['a']);
  });

  it('deep clones fallback object when parse fails', () => {
    const fallback = {
      layout: { span: 12 },
      items: [{ key: '1', label: 'A' }],
    };
    const result = sanitizeJsonValue('invalid-json', fallback);

    expect(result).toEqual(fallback);
    expect(result).not.toBe(fallback);
    expect(result.layout).not.toBe(fallback.layout);
    expect(result.items).not.toBe(fallback.items);
    expect(result.items[0]).not.toBe(fallback.items[0]);
  });
});

describe('sanitizeExpressionValue', () => {
  it('normalizes plain expression into moustache style', () => {
    expect(sanitizeExpressionValue('user.name')).toBe('{{user.name}}');
  });

  it('falls back when braces are malformed', () => {
    expect(sanitizeExpressionValue('{{ user.name', '{{default}}')).toBe('{{default}}');
  });

  it('handles empty and undefined input safely', () => {
    expect(sanitizeExpressionValue('   ', '{{default}}')).toBe('');
    expect(sanitizeExpressionValue(undefined, '{{default}}')).toBe('{{default}}');
  });

  it('falls back when expression exceeds length limit', () => {
    const oversized = 'a'.repeat(10001);
    expect(sanitizeExpressionValue(oversized, '{{default}}')).toBe('{{default}}');
  });
});

describe('sanitizeSlotValue', () => {
  it('accepts string/number/boolean and falls back for unsupported type', () => {
    expect(sanitizeSlotValue('hello', '')).toBe('hello');
    expect(sanitizeSlotValue(123, '')).toBe('123');
    expect(sanitizeSlotValue(true, '')).toBe('true');
    expect(sanitizeSlotValue({ foo: 'bar' }, 'fallback')).toBe('fallback');
  });

  it('falls back for null/undefined', () => {
    expect(sanitizeSlotValue(null, 'fallback')).toBe('fallback');
    expect(sanitizeSlotValue(undefined, 'fallback')).toBe('fallback');
  });
});
