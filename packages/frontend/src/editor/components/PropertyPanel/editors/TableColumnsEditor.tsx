import React, { useCallback, useMemo, useEffect } from 'react';
import styles from '../PropertyPanel.module.scss';
import {
  createDefaultTableActionButton,
  createDefaultTableColumn,
  isTableActionColumn,
  isTableLinkColumn,
  sanitizeTableColumnsValue,
  warnDuplicateKeys,
  type TableColumnAlign,
  type TableColumnItem,
  type TableColumnKind,
  type TableLinkTextMode,
  DEFAULT_TABLE_COLUMN,
} from './complexValueUtils';
import { stripStableIds, toWidth } from './TableColumns/mappers';
import { useStableIdReconcile } from './TableColumns/useStableIdReconcile';
import { TableColumnRow } from './TableColumns/TableColumnRow';

interface TableColumnsEditorProps {
  label: string;
  value: unknown;
  onChange: (value: TableColumnItem[]) => void;
  description?: string;
  defaultTemplate?: unknown;
  sourceIdentity?: string;
}

export const TableColumnsEditor: React.FC<TableColumnsEditorProps> = ({
  label,
  value,
  onChange,
  description,
  defaultTemplate,
  sourceIdentity,
}) => {
  const template = useMemo(
    () => sanitizeTableColumnsValue(defaultTemplate, [DEFAULT_TABLE_COLUMN]),
    [defaultTemplate],
  );

  const columns = useStableIdReconcile(value, template, sourceIdentity);

  const emitColumns = useCallback(
    (nextColumns: TableColumnItem[]) => {
      const sanitized = sanitizeTableColumnsValue(nextColumns, template);
      const stripped = stripStableIds(sanitized);
      onChange(stripped as TableColumnItem[]);
    },
    [onChange, template],
  );

  useEffect(() => {
    warnDuplicateKeys(columns);
  }, [columns]);

  const updateColumn = useCallback(
    (index: number, updater: (column: TableColumnItem) => TableColumnItem) => {
      emitColumns(columns.map((column, i) => (i === index ? updater(column) : column)));
    },
    [columns, emitColumns],
  );

  const handleAddColumn = useCallback(() => {
    emitColumns([...columns, createDefaultTableColumn(columns.length)]);
  }, [columns, emitColumns]);

  const handleResetTemplate = useCallback(() => {
    emitColumns(template);
  }, [emitColumns, template]);

  const handleRemoveColumn = useCallback(
    (index: number) => {
      const nextColumns = columns.filter((_, i) => i !== index);
      emitColumns(nextColumns.length > 0 ? nextColumns : template);
    },
    [columns, emitColumns, template],
  );

  const handleKindChange = useCallback(
    (index: number, nextKind: TableColumnKind) => {
      updateColumn(index, (column) => {
        const title = column.title;
        const width = column.width;
        const align = column.align;
        const stableId = (column as TableColumnItem & { __stableId?: string }).__stableId;
        if (nextKind === 'action') {
          const fallback = createDefaultTableColumn(index, 'action');
          return {
            ...(fallback as Extract<TableColumnItem, { kind: 'action' }>),
            title: title || fallback.title,
            key: column.key || fallback.key,
            width,
            align,
            __stableId:
              stableId ?? (fallback as TableColumnItem & { __stableId?: string }).__stableId,
          } as TableColumnItem;
        }
        const fallback = createDefaultTableColumn(index, nextKind);
        const fallbackDataColumn = fallback as Extract<
          TableColumnItem,
          { kind?: 'data' } | { kind: 'link' }
        >;
        const dataIndex = !isTableActionColumn(column)
          ? column.dataIndex
          : fallbackDataColumn.dataIndex;
        const key = column.key || dataIndex || fallback.key;
        if (nextKind === 'link') {
          return {
            ...(fallback as Extract<TableColumnItem, { kind: 'link' }>),
            title: title || fallback.title,
            dataIndex,
            key,
            width,
            align,
            __stableId:
              stableId ?? (fallback as TableColumnItem & { __stableId?: string }).__stableId,
          } as TableColumnItem;
        }
        return {
          ...(fallback as Extract<TableColumnItem, { kind?: 'data' }>),
          title: title || fallback.title,
          dataIndex,
          key,
          width,
          align,
          __stableId:
            stableId ?? (fallback as TableColumnItem & { __stableId?: string }).__stableId,
        } as TableColumnItem;
      });
    },
    [updateColumn],
  );

  const handleFieldChange = useCallback(
    (
      index: number,
      field: 'title' | 'key' | 'dataIndex' | 'width' | 'align',
      nextValue: string,
    ) => {
      updateColumn(index, (column) => {
        if (field === 'width') return { ...column, width: toWidth(nextValue) };
        if (field === 'align')
          return { ...column, align: nextValue ? (nextValue as TableColumnAlign) : undefined };
        if (field === 'dataIndex' && isTableActionColumn(column)) return column;
        return { ...column, [field]: nextValue };
      });
    },
    [updateColumn],
  );

  const handleLinkTextModeChange = useCallback(
    (index: number, nextValue: string) => {
      updateColumn(index, (column) => {
        if (!isTableLinkColumn(column)) return column;
        const textMode = nextValue as TableLinkTextMode;
        return {
          ...column,
          textMode,
          textTemplate:
            textMode === 'template' ? (column.textTemplate ?? '{{value}}') : column.textTemplate,
        };
      });
    },
    [updateColumn],
  );

  const handleLinkTextTemplateChange = useCallback(
    (index: number, nextValue: string) => {
      updateColumn(index, (column) =>
        isTableLinkColumn(column) ? { ...column, textTemplate: nextValue } : column,
      );
    },
    [updateColumn],
  );

  const handleLinkActionsChange = useCallback(
    (index: number, nextValue: unknown) => {
      updateColumn(index, (column) =>
        isTableLinkColumn(column) ? { ...column, actions: nextValue as never } : column,
      );
    },
    [updateColumn],
  );

  const handleAddActionButton = useCallback(
    (index: number) => {
      updateColumn(index, (column) =>
        isTableActionColumn(column)
          ? {
              ...column,
              buttons: [...column.buttons, createDefaultTableActionButton(column.buttons.length)],
            }
          : column,
      );
    },
    [updateColumn],
  );

  const handleRemoveActionButton = useCallback(
    (columnIndex: number, buttonIndex: number) => {
      updateColumn(columnIndex, (column) =>
        isTableActionColumn(column)
          ? { ...column, buttons: column.buttons.filter((_, index) => index !== buttonIndex) }
          : column,
      );
    },
    [updateColumn],
  );

  const handleActionButtonFieldChange = useCallback(
    (
      columnIndex: number,
      buttonIndex: number,
      field: 'label' | 'buttonType' | 'danger',
      nextValue: string | boolean,
    ) => {
      updateColumn(columnIndex, (column) => {
        if (!isTableActionColumn(column)) return column;
        return {
          ...column,
          buttons: column.buttons.map((button, index) =>
            index === buttonIndex ? { ...button, [field]: nextValue } : button,
          ),
        };
      });
    },
    [updateColumn],
  );

  const handleActionButtonActionsChange = useCallback(
    (columnIndex: number, buttonIndex: number, nextValue: unknown) => {
      updateColumn(columnIndex, (column) => {
        if (!isTableActionColumn(column)) return column;
        return {
          ...column,
          buttons: column.buttons.map((button, index) =>
            index === buttonIndex ? { ...button, actions: nextValue as never } : button,
          ),
        };
      });
    },
    [updateColumn],
  );

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>

      <div className={styles.complexEditor}>
        <div className={styles.complexEditorActions}>
          <button type="button" onClick={handleAddColumn}>
            新增列
          </button>
          <button type="button" onClick={handleResetTemplate}>
            恢复模板
          </button>
        </div>

        {columns.map((column, index) => (
          <TableColumnRow
            key={
              (column as TableColumnItem & { __stableId?: string }).__stableId ??
              `${column.key}-${index}`
            }
            column={column}
            index={index}
            onRemove={handleRemoveColumn}
            onKindChange={handleKindChange}
            onFieldChange={handleFieldChange}
            onLinkTextModeChange={handleLinkTextModeChange}
            onLinkTextTemplateChange={handleLinkTextTemplateChange}
            onLinkActionsChange={handleLinkActionsChange}
            onAddActionButton={handleAddActionButton}
            onRemoveActionButton={handleRemoveActionButton}
            onActionButtonFieldChange={handleActionButtonFieldChange}
            onActionButtonActionsChange={handleActionButtonActionsChange}
          />
        ))}
      </div>
    </div>
  );
};
