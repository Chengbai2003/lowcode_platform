import React from 'react';
import styles from '../../PropertyPanel.module.scss';
import { JsonEditor } from '../JsonEditor';
import {
  isTableActionColumn,
  isTableLinkColumn,
  type TableColumnAlign,
  type TableColumnItem,
  type TableColumnKind,
  type TableLinkTextMode,
} from '../complexValueUtils';
import { TableActionButtons } from './TableActionButtons';

const ALIGN_OPTIONS: Array<{ label: string; value: TableColumnAlign }> = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
];

const KIND_OPTIONS: Array<{ label: string; value: TableColumnKind }> = [
  { label: '数据列', value: 'data' },
  { label: '链接列', value: 'link' },
  { label: '操作列', value: 'action' },
];

const TEXT_MODE_OPTIONS: Array<{ label: string; value: TableLinkTextMode }> = [
  { label: '显示字段值', value: 'value' },
  { label: '使用模板', value: 'template' },
];

interface Props {
  column: TableColumnItem;
  index: number;
  onRemove: (index: number) => void;
  onKindChange: (index: number, kind: TableColumnKind) => void;
  onFieldChange: (
    index: number,
    field: 'title' | 'key' | 'dataIndex' | 'width' | 'align',
    value: string,
  ) => void;
  onLinkTextModeChange: (index: number, value: string) => void;
  onLinkTextTemplateChange: (index: number, value: string) => void;
  onLinkActionsChange: (index: number, value: unknown) => void;
  onAddActionButton: (index: number) => void;
  onRemoveActionButton: (columnIndex: number, buttonIndex: number) => void;
  onActionButtonFieldChange: (
    columnIndex: number,
    buttonIndex: number,
    field: 'label' | 'buttonType' | 'danger',
    value: string | boolean,
  ) => void;
  onActionButtonActionsChange: (columnIndex: number, buttonIndex: number, value: unknown) => void;
}

export const TableColumnRow: React.FC<Props> = ({
  column,
  index,
  onRemove,
  onKindChange,
  onFieldChange,
  onLinkTextModeChange,
  onLinkTextTemplateChange,
  onLinkActionsChange,
  onAddActionButton,
  onRemoveActionButton,
  onActionButtonFieldChange,
  onActionButtonActionsChange,
}) => {
  const stableId = (column as TableColumnItem & { __stableId?: string }).__stableId;
  const columnKey = stableId ?? `${column.key}-${index}`;

  return (
    <div
      className={styles.complexEditorCard}
      key={columnKey}
      data-testid={`table-column-row-${index}`}
    >
      <div className={styles.complexEditorCardHeader}>
        <span>列 {index + 1}</span>
        <button type="button" onClick={() => onRemove(index)}>
          删除
        </button>
      </div>

      <div className={styles.complexEditorGrid}>
        <select
          aria-label={`列${index + 1}类型`}
          value={column.kind ?? 'data'}
          onChange={(event) => onKindChange(index, event.target.value as TableColumnKind)}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          aria-label={`列${index + 1}标题`}
          value={column.title}
          onChange={(event) => onFieldChange(index, 'title', event.target.value)}
          placeholder="标题"
        />

        {!isTableActionColumn(column) && (
          <input
            aria-label={`列${index + 1}字段`}
            value={column.dataIndex}
            onChange={(event) => onFieldChange(index, 'dataIndex', event.target.value)}
            placeholder="dataIndex"
          />
        )}

        <input
          aria-label={`列${index + 1}键名`}
          value={column.key}
          onChange={(event) => onFieldChange(index, 'key', event.target.value)}
          placeholder="key"
        />

        <input
          type="number"
          aria-label={`列${index + 1}宽度`}
          value={column.width != null ? String(column.width) : ''}
          onChange={(event) => onFieldChange(index, 'width', event.target.value)}
          placeholder="宽度"
          min={1}
        />

        <select
          aria-label={`列${index + 1}对齐`}
          value={column.align ?? ''}
          onChange={(event) => onFieldChange(index, 'align', event.target.value)}
        >
          <option value="">默认对齐</option>
          {ALIGN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isTableLinkColumn(column) && (
        <div className={styles.complexEditor}>
          <div className={styles.complexEditorGrid}>
            <select
              aria-label={`列${index + 1}文本模式`}
              value={column.textMode ?? 'value'}
              onChange={(event) => onLinkTextModeChange(index, event.target.value)}
            >
              {TEXT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {(column.textMode ?? 'value') === 'template' && (
              <input
                aria-label={`列${index + 1}文本模板`}
                value={typeof column.textTemplate === 'string' ? column.textTemplate : ''}
                onChange={(event) => onLinkTextTemplateChange(index, event.target.value)}
                placeholder="{{value}} 或 {{record.name}}"
              />
            )}
          </div>

          <JsonEditor
            label="点击动作"
            value={column.actions}
            onChange={(nextValue) => onLinkActionsChange(index, nextValue)}
            defaultTemplate={[]}
            description="使用现有 ActionList，例如 navigate / feedback / setValue"
          />
        </div>
      )}

      {isTableActionColumn(column) && (
        <TableActionButtons
          columnIndex={index}
          buttons={column.buttons as never}
          onAdd={onAddActionButton}
          onRemove={onRemoveActionButton}
          onFieldChange={onActionButtonFieldChange}
          onActionsChange={onActionButtonActionsChange}
        />
      )}
    </div>
  );
};
