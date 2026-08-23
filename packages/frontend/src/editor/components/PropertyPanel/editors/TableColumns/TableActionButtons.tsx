import React from 'react';
import styles from '../../PropertyPanel.module.scss';
import { JsonEditor } from '../JsonEditor';
import type { TableActionButtonType, TableColumnItem } from '../complexValueUtils';

const BUTTON_TYPE_OPTIONS: Array<{ label: string; value: TableActionButtonType }> = [
  { label: '文本', value: 'text' },
  { label: '链接', value: 'link' },
  { label: '主按钮', value: 'primary' },
  { label: '默认', value: 'default' },
];

interface Props {
  columnIndex: number;
  buttons: TableColumnItem extends { kind: 'action'; buttons: infer B } ? B : never;
  onAdd: (columnIndex: number) => void;
  onRemove: (columnIndex: number, buttonIndex: number) => void;
  onFieldChange: (
    columnIndex: number,
    buttonIndex: number,
    field: 'label' | 'buttonType' | 'danger',
    nextValue: string | boolean,
  ) => void;
  onActionsChange: (columnIndex: number, buttonIndex: number, nextValue: unknown) => void;
}

export const TableActionButtons: React.FC<Props> = ({
  columnIndex,
  buttons,
  onAdd,
  onRemove,
  onFieldChange,
  onActionsChange,
}) => {
  return (
    <div className={styles.complexEditor}>
      <div className={styles.complexEditorActions}>
        <button type="button" onClick={() => onAdd(columnIndex)}>
          新增按钮
        </button>
      </div>

      {(
        buttons as unknown as Array<{
          label: string;
          buttonType?: string;
          danger?: boolean;
          actions?: unknown;
          __stableId?: string;
        }>
      ).length === 0 ? (
        <div className={styles.complexEditorEmpty}>暂无按钮，点击“新增按钮”开始配置。</div>
      ) : (
        (buttons as unknown as Array<Record<string, unknown>>).map(
          (button: Record<string, unknown>, buttonIndex: number) => {
            const btnStableId = (button as { __stableId?: string }).__stableId;
            const btnKey = btnStableId ?? `${(button as { label?: string }).label}-${buttonIndex}`;
            return (
              <div className={styles.complexEditorCard} key={btnKey}>
                <div className={styles.complexEditorCardHeader}>
                  <span>按钮 {buttonIndex + 1}</span>
                  <button type="button" onClick={() => onRemove(columnIndex, buttonIndex)}>
                    删除
                  </button>
                </div>

                <div className={styles.complexEditorGrid}>
                  <input
                    aria-label={`列${columnIndex + 1}按钮${buttonIndex + 1}文本`}
                    value={(button as { label?: string }).label ?? ''}
                    onChange={(event) =>
                      onFieldChange(columnIndex, buttonIndex, 'label', event.target.value)
                    }
                    placeholder="按钮文本"
                  />

                  <select
                    aria-label={`列${columnIndex + 1}按钮${buttonIndex + 1}类型`}
                    value={(button as { buttonType?: string }).buttonType ?? 'text'}
                    onChange={(event) =>
                      onFieldChange(columnIndex, buttonIndex, 'buttonType', event.target.value)
                    }
                  >
                    {BUTTON_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className={styles.checkboxInline}>
                  <input
                    type="checkbox"
                    aria-label={`列${columnIndex + 1}按钮${buttonIndex + 1}危险样式`}
                    checked={(button as { danger?: boolean }).danger ?? false}
                    onChange={(event) =>
                      onFieldChange(columnIndex, buttonIndex, 'danger', event.target.checked)
                    }
                  />
                  危险样式
                </label>

                <JsonEditor
                  label="按钮动作"
                  value={(button as { actions?: unknown }).actions}
                  onChange={(nextValue) => onActionsChange(columnIndex, buttonIndex, nextValue)}
                  defaultTemplate={[]}
                  description="使用现有 ActionList，例如 navigate / feedback / dialog"
                />
              </div>
            );
          },
        )
      )}
    </div>
  );
};
