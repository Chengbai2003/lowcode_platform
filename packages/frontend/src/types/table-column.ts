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
  /** 隐藏稳定 ID，用于 React key，避免使用可编辑的 key/dataIndex 导致 remount */
  __stableId?: string;
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
  __stableId?: string;
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

function generateStableId(): string {
  try {
    // 优先使用 crypto.randomUUID，降级到时间戳+随机数
    const maybeCrypto =
      typeof crypto !== 'undefined' && (crypto as { randomUUID?: () => string }).randomUUID;
    if (maybeCrypto) {
      return `col_${maybeCrypto.call(crypto)}`;
    }
  } catch {
    // ignore
  }
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneInternalColumn<T extends TableColumnItem>(col: T): T & { __stableId: string } {
  const cloned = {
    ...(col as unknown as Record<string, unknown>),
  } as unknown as T & { __stableId?: string };
  if (
    'buttons' in (cloned as unknown as Record<string, unknown>) &&
    Array.isArray((cloned as unknown as { buttons: unknown }).buttons)
  ) {
    (cloned as unknown as { buttons: Array<Record<string, unknown>> }).buttons = (
      cloned as unknown as { buttons: Array<Record<string, unknown>> }
    ).buttons.map((b) => ({ ...(b as unknown as Record<string, unknown>) }));
  }
  return cloned as T & { __stableId: string };
}

export function findDuplicateKeys(columns: TableColumnItem[]): string[] {
  const counts = new Map<string, number>();
  for (const col of columns) {
    const key = col.key;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export function warnDuplicateKeys(columns: TableColumnItem[]): void {
  const dups = findDuplicateKeys(columns);
  if (dups.length > 0) {
    console.warn(`[TableColumnsEditor] duplicate column keys: ${dups.join(', ')}`);
  }
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
    .map((item) => cloneValue(item)) as unknown as ActionList;
}

export function createDefaultTableActionButton(index: number): TableActionColumnButton {
  const no = index + 1;
  return {
    label: `操作${no}`,
    buttonType: 'text',
    danger: false,
    actions: [],
    __stableId: generateStableId(),
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
      __stableId: generateStableId(),
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
      __stableId: generateStableId(),
    };
  }

  return {
    kind: 'data',
    title: `列${no}`,
    dataIndex: `col${no}`,
    key: `col${no}`,
    __stableId: generateStableId(),
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
      const __stableId =
        typeof record.__stableId === 'string' && record.__stableId.trim()
          ? record.__stableId.trim()
          : typeof (record as Record<string, unknown>)._stableId === 'string' &&
              ((record as Record<string, unknown>)._stableId as string).trim()
            ? ((record as Record<string, unknown>)._stableId as string).trim()
            : generateStableId();

      return {
        label,
        buttonType,
        danger,
        actions: sanitizeActionList(record.actions),
        __stableId,
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
    const __stableId =
      typeof record.__stableId === 'string' && record.__stableId.trim()
        ? record.__stableId.trim()
        : typeof (record as Record<string, unknown>)._stableId === 'string' &&
            ((record as Record<string, unknown>)._stableId as string).trim()
          ? ((record as Record<string, unknown>)._stableId as string).trim()
          : typeof (record as Record<string, unknown>)._id === 'string' &&
              ((record as Record<string, unknown>)._id as string).trim()
            ? ((record as Record<string, unknown>)._id as string).trim()
            : generateStableId();

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
        __stableId,
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
        __stableId,
      };
    }

    return {
      kind: 'data',
      title,
      dataIndex,
      key,
      width,
      align,
      __stableId,
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
