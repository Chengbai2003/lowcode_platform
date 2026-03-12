import React, { useCallback, useMemo } from 'react';
import styles from '../PropertyPanel.module.scss';
import {
  DEFAULT_TABLE_COLUMN,
  createDefaultTableColumn,
  sanitizeTableColumnsValue,
  type TableColumnAlign,
  type TableColumnItem,
} from './complexValueUtils';

interface TableColumnsEditorProps {
  label: string;
  value: unknown;
  onChange: (value: TableColumnItem[]) => void;
  description?: string;
  defaultTemplate?: unknown;
}

const ALIGN_OPTIONS: Array<{ label: string; value: TableColumnAlign }> = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
];

export const TableColumnsEditor: React.FC<TableColumnsEditorProps> = ({
  label,
  value,
  onChange,
  description,
  defaultTemplate,
}) => {
  const template = useMemo(
    () => sanitizeTableColumnsValue(defaultTemplate, [DEFAULT_TABLE_COLUMN]),
    [defaultTemplate],
  );
  const columns = useMemo(() => sanitizeTableColumnsValue(value, template), [value, template]);

  const emitColumns = useCallback(
    (nextColumns: TableColumnItem[]) => {
      onChange(sanitizeTableColumnsValue(nextColumns, template));
    },
    [onChange, template],
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
      // `template` is sanitized from DEFAULT_TABLE_COLUMN and guaranteed to be non-empty.
      emitColumns(nextColumns.length > 0 ? nextColumns : template);
    },
    [columns, emitColumns, template],
  );

  const handleFieldChange = useCallback(
    (index: number, field: keyof TableColumnItem, nextValue: string) => {
      const nextColumns = columns.map((column, i) => {
        if (i !== index) return column;
        if (field === 'width') {
          const trimmed = nextValue.trim();
          if (!trimmed) {
            return { ...column, width: undefined };
          }
          const width = Number(trimmed);
          return Number.isFinite(width) && width > 0
            ? { ...column, width }
            : { ...column, width: undefined };
        }
        if (field === 'align') {
          return {
            ...column,
            align: nextValue ? (nextValue as TableColumnAlign) : undefined,
          };
        }
        return {
          ...column,
          [field]: nextValue,
        };
      });
      emitColumns(nextColumns);
    },
    [columns, emitColumns],
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
          <div
            className={styles.complexEditorCard}
            key={`${column.key}-${index}`}
            data-testid={`table-column-row-${index}`}
          >
            <div className={styles.complexEditorCardHeader}>
              <span>列 {index + 1}</span>
              <button type="button" onClick={() => handleRemoveColumn(index)}>
                删除
              </button>
            </div>
            <div className={styles.complexEditorGrid}>
              <input
                aria-label={`列${index + 1}标题`}
                value={column.title}
                onChange={(e) => handleFieldChange(index, 'title', e.target.value)}
                placeholder="标题"
              />
              <input
                aria-label={`列${index + 1}字段`}
                value={column.dataIndex}
                onChange={(e) => handleFieldChange(index, 'dataIndex', e.target.value)}
                placeholder="dataIndex"
              />
              <input
                aria-label={`列${index + 1}键名`}
                value={column.key}
                onChange={(e) => handleFieldChange(index, 'key', e.target.value)}
                placeholder="key"
              />
              <input
                type="number"
                aria-label={`列${index + 1}宽度`}
                value={column.width ?? ''}
                onChange={(e) => handleFieldChange(index, 'width', e.target.value)}
                placeholder="宽度"
                min={1}
              />
              <select
                aria-label={`列${index + 1}对齐`}
                value={column.align ?? ''}
                onChange={(e) => handleFieldChange(index, 'align', e.target.value)}
              >
                <option value="">默认对齐</option>
                {ALIGN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
