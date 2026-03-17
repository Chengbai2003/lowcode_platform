import type { ActionList, Value } from './dsl';

export type TableColumnAlign = 'left' | 'center' | 'right';
export type TableColumnKind = 'data' | 'link' | 'action';
export type TableLinkTextMode = 'value' | 'template';
export type TableActionButtonType = 'text' | 'link' | 'primary' | 'default';

export interface BaseTableColumnItem {
  kind?: TableColumnKind;
  title: string;
  key: string;
  width?: number;
  align?: TableColumnAlign;
}

export interface TableDataColumnItem extends BaseTableColumnItem {
  kind?: 'data';
  dataIndex: string;
}

export interface TableLinkColumnItem extends BaseTableColumnItem {
  kind: 'link';
  dataIndex: string;
  textMode?: TableLinkTextMode;
  textTemplate?: Value;
  actions: ActionList;
}

export interface TableActionColumnButton {
  label: string;
  buttonType?: TableActionButtonType;
  danger?: boolean;
  actions: ActionList;
}

export interface TableActionColumnItem extends BaseTableColumnItem {
  kind: 'action';
  buttons: TableActionColumnButton[];
}

export type TableColumnItem = TableDataColumnItem | TableLinkColumnItem | TableActionColumnItem;

const TABLE_ALIGN_SET = new Set<TableColumnAlign>(['left', 'center', 'right']);
const TABLE_COLUMN_KIND_SET = new Set<TableColumnKind>(['data', 'link', 'action']);
const TABLE_LINK_TEXT_MODE_SET = new Set<TableLinkTextMode>(['value', 'template']);
const TABLE_ACTION_BUTTON_TYPE_SET = new Set<TableActionButtonType>([
  'text',
  'link',
  'primary',
  'default',
]);

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

function sanitizeActionList(value: unknown): ActionList {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && typeof item.type === 'string',
    )
    .map((item) => cloneValue(item)) as ActionList;
}

export function createDefaultTableActionButton(index: number): TableActionColumnButton {
  const no = index + 1;
  return {
    label: `操作${no}`,
    buttonType: 'text',
    danger: false,
    actions: [],
  };
}

export function createDefaultTableColumn(
  index: number,
  kind: TableColumnKind = 'data',
): TableColumnItem {
  const no = index + 1;

  if (kind === 'action') {
    return {
      kind: 'action',
      title: '操作',
      key: no === 1 ? 'actions' : `actions${no}`,
      buttons: [createDefaultTableActionButton(0)],
    };
  }

  if (kind === 'link') {
    return {
      kind: 'link',
      title: `列${no}`,
      dataIndex: `col${no}`,
      key: `col${no}`,
      textMode: 'value',
      actions: [],
    };
  }

  return {
    kind: 'data',
    title: `列${no}`,
    dataIndex: `col${no}`,
    key: `col${no}`,
  };
}

export const DEFAULT_TABLE_COLUMN: TableColumnItem = createDefaultTableColumn(0, 'data');

export function sanitizeTableActionButtons(
  value: unknown,
  fallback: TableActionColumnButton[] = [createDefaultTableActionButton(0)],
): TableActionColumnButton[] {
  const parsed = tryParseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return fallback.map((item) => cloneValue(item));
  }

  return parsed
    .map((item, index): TableActionColumnButton | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const defaultButton = createDefaultTableActionButton(index);
      const label =
        typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : defaultButton.label;
      const buttonType =
        typeof record.buttonType === 'string' &&
        TABLE_ACTION_BUTTON_TYPE_SET.has(record.buttonType as TableActionButtonType)
          ? (record.buttonType as TableActionButtonType)
          : defaultButton.buttonType;
      const danger = typeof record.danger === 'boolean' ? record.danger : false;

      return {
        label,
        buttonType,
        danger,
        actions: sanitizeActionList(record.actions),
      };
    })
    .filter((item): item is TableActionColumnButton => item !== null);
}

export function sanitizeTableColumnsValue(
  value: unknown,
  fallback: TableColumnItem[] = [DEFAULT_TABLE_COLUMN],
): TableColumnItem[] {
  const normalizeColumn = (item: unknown, index: number): TableColumnItem | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const kind =
      typeof record.kind === 'string' && TABLE_COLUMN_KIND_SET.has(record.kind as TableColumnKind)
        ? (record.kind as TableColumnKind)
        : 'data';
    const defaultColumn = createDefaultTableColumn(index, kind);
    const title =
      typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : defaultColumn.title;
    const width = toPositiveNumber(record.width);
    const align =
      typeof record.align === 'string' && TABLE_ALIGN_SET.has(record.align as TableColumnAlign)
        ? (record.align as TableColumnAlign)
        : undefined;

    if (kind === 'action') {
      const defaultActionColumn = defaultColumn as TableActionColumnItem;
      const key =
        typeof record.key === 'string' && record.key.trim()
          ? record.key.trim()
          : defaultActionColumn.key;
      return {
        kind: 'action',
        title,
        key,
        width,
        align,
        buttons: sanitizeTableActionButtons(record.buttons, defaultActionColumn.buttons),
      };
    }

    const defaultDataColumn = defaultColumn as TableDataColumnItem | TableLinkColumnItem;
    const dataIndex =
      typeof record.dataIndex === 'string' && record.dataIndex.trim()
        ? record.dataIndex.trim()
        : defaultDataColumn.dataIndex;
    const key = typeof record.key === 'string' && record.key.trim() ? record.key.trim() : dataIndex;

    if (kind === 'link') {
      const defaultLinkColumn = defaultColumn as TableLinkColumnItem;
      const textMode =
        typeof record.textMode === 'string' &&
        TABLE_LINK_TEXT_MODE_SET.has(record.textMode as TableLinkTextMode)
          ? (record.textMode as TableLinkTextMode)
          : (defaultLinkColumn.textMode ?? 'value');
      const textTemplate =
        record.textTemplate !== undefined
          ? (cloneValue(record.textTemplate) as Value)
          : textMode === 'template'
            ? '{{value}}'
            : undefined;

      return {
        kind: 'link',
        title,
        dataIndex,
        key,
        width,
        align,
        textMode,
        textTemplate,
        actions: sanitizeActionList(record.actions),
      };
    }

    return {
      kind: 'data',
      title,
      dataIndex,
      key,
      width,
      align,
    };
  };

  const normalizedFallback =
    fallback.length > 0
      ? fallback
          .map((item, index) => normalizeColumn(item, index))
          .filter((item): item is TableColumnItem => item !== null)
      : [cloneValue(DEFAULT_TABLE_COLUMN)];
  const parsed = tryParseJsonValue(value);

  if (!Array.isArray(parsed)) {
    return normalizedFallback.map((item) => cloneValue(item));
  }

  const normalized = parsed
    .map((item, index) => normalizeColumn(item, index))
    .filter((item): item is TableColumnItem => item !== null);

  if (normalized.length === 0) {
    return normalizedFallback.map((item) => cloneValue(item));
  }

  return normalized;
}

export function isTableLinkColumn(column: TableColumnItem): column is TableLinkColumnItem {
  return column.kind === 'link';
}

export function isTableActionColumn(column: TableColumnItem): column is TableActionColumnItem {
  return column.kind === 'action';
}
