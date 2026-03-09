export type TableColumnAlign = 'left' | 'center' | 'right';

export interface TableColumnItem {
  title: string;
  dataIndex: string;
  key: string;
  width?: number;
  align?: TableColumnAlign;
}

export interface FormRuleItem {
  required?: boolean;
  message?: string;
  type?: string;
  trigger?: string;
}

const TABLE_ALIGN_SET = new Set<TableColumnAlign>(['left', 'center', 'right']);
const FORM_RULE_TRIGGERS = new Set(['onChange', 'onBlur', 'onSubmit']);
const EXPRESSION_REGEX = /^\{\{[\s\S]+\}\}$/;
const MAX_EXPRESSION_LENGTH = 10000;

export const DEFAULT_TABLE_COLUMN: TableColumnItem = {
  title: '列1',
  dataIndex: 'col1',
  key: 'col1',
};

export const DEFAULT_FORM_RULE: FormRuleItem = {
  required: false,
  message: '',
  type: undefined,
  trigger: 'onChange',
};

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cloneValue(v)]),
    ) as T;
  }

  return value;
}

function tryParseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

export function createDefaultTableColumn(index: number): TableColumnItem {
  const no = index + 1;
  return {
    title: `列${no}`,
    dataIndex: `col${no}`,
    key: `col${no}`,
  };
}

export function createDefaultFormRule(): FormRuleItem {
  return { ...DEFAULT_FORM_RULE };
}

function getValueType(
  value: unknown,
): 'array' | 'object' | 'number' | 'boolean' | 'string' | 'other' {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'object';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'other';
}

export function sanitizeJsonValue<T = unknown>(value: unknown, fallback: T): T {
  const parsed = tryParseJsonValue(value);
  const fallbackType = getValueType(fallback);

  if (fallbackType === 'other') {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return cloneValue(fallback);
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return cloneValue(fallback);
      }
    }
    return (parsed as T) ?? cloneValue(fallback);
  }

  if (fallbackType === 'array') {
    return Array.isArray(parsed) ? (parsed as T) : cloneValue(fallback);
  }

  if (fallbackType === 'object') {
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as T)
      : cloneValue(fallback);
  }

  if (fallbackType === 'number') {
    return typeof parsed === 'number' && Number.isFinite(parsed)
      ? (parsed as T)
      : cloneValue(fallback);
  }

  if (fallbackType === 'boolean') {
    return typeof parsed === 'boolean' ? (parsed as T) : cloneValue(fallback);
  }

  if (fallbackType === 'string') {
    return typeof parsed === 'string' ? (parsed as T) : cloneValue(fallback);
  }

  return cloneValue(fallback);
}

export function sanitizeExpressionValue(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_EXPRESSION_LENGTH) return fallback;

  if (EXPRESSION_REGEX.test(trimmed)) {
    const body = trimmed.slice(2, -2).trim();
    if (!body || body.length > MAX_EXPRESSION_LENGTH) return fallback;
    return `{{${body}}}`;
  }

  if (trimmed.includes('{{') || trimmed.includes('}}')) {
    return fallback;
  }

  return `{{${trimmed}}}`;
}

export function sanitizeSlotValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function sanitizeTableColumnsValue(
  value: unknown,
  fallback: TableColumnItem[] = [DEFAULT_TABLE_COLUMN],
): TableColumnItem[] {
  const parsed = tryParseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return fallback.length > 0 ? fallback.map((item) => ({ ...item })) : [DEFAULT_TABLE_COLUMN];
  }

  const normalized = parsed
    .map((item, index): TableColumnItem | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const defaultColumn = createDefaultTableColumn(index);
      const title =
        typeof record.title === 'string' && record.title.trim()
          ? record.title.trim()
          : defaultColumn.title;
      const dataIndex =
        typeof record.dataIndex === 'string' && record.dataIndex.trim()
          ? record.dataIndex.trim()
          : defaultColumn.dataIndex;
      const key =
        typeof record.key === 'string' && record.key.trim() ? record.key.trim() : dataIndex;
      const width = toPositiveNumber(record.width);
      const align =
        typeof record.align === 'string' && TABLE_ALIGN_SET.has(record.align as TableColumnAlign)
          ? (record.align as TableColumnAlign)
          : undefined;

      return {
        title,
        dataIndex,
        key,
        width,
        align,
      };
    })
    .filter((item): item is TableColumnItem => item !== null);

  if (normalized.length === 0) {
    return fallback.length > 0 ? fallback.map((item) => ({ ...item })) : [DEFAULT_TABLE_COLUMN];
  }

  return normalized;
}

export function sanitizeFormRulesValue(
  value: unknown,
  fallback: FormRuleItem[] = [],
): FormRuleItem[] {
  const parsed = tryParseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return fallback.map((item) => ({ ...item }));
  }

  return parsed
    .map((item): FormRuleItem | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        required: typeof record.required === 'boolean' ? record.required : undefined,
        message: typeof record.message === 'string' ? record.message : '',
        type:
          typeof record.type === 'string' && record.type.trim() ? record.type.trim() : undefined,
        trigger:
          typeof record.trigger === 'string' && FORM_RULE_TRIGGERS.has(record.trigger)
            ? record.trigger
            : 'onChange',
      };
    })
    .filter((item): item is FormRuleItem => item !== null);
}
