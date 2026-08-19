import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import styles from '../PropertyPanel.module.scss';
import { JsonEditor } from './JsonEditor';
import {
  DEFAULT_TABLE_COLUMN,
  createDefaultTableActionButton,
  createDefaultTableColumn,
  isTableActionColumn,
  isTableLinkColumn,
  sanitizeTableColumnsValue,
  type TableActionButtonType,
  type TableColumnAlign,
  type TableColumnItem,
  type TableColumnKind,
  type TableLinkTextMode,
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

const KIND_OPTIONS: Array<{ label: string; value: TableColumnKind }> = [
  { label: '数据列', value: 'data' },
  { label: '链接列', value: 'link' },
  { label: '操作列', value: 'action' },
];

const TEXT_MODE_OPTIONS: Array<{ label: string; value: TableLinkTextMode }> = [
  { label: '显示字段值', value: 'value' },
  { label: '使用模板', value: 'template' },
];

const BUTTON_TYPE_OPTIONS: Array<{ label: string; value: TableActionButtonType }> = [
  { label: '文本', value: 'text' },
  { label: '链接', value: 'link' },
  { label: '主按钮', value: 'primary' },
  { label: '默认', value: 'default' },
];

function toWidth(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const width = Number(trimmed);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

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

  // Draft 态：输入过程中的原始字符串，允许空字符串等中间态，blur 时再提交 sanitized 值（P0-9）
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const prevStableIdsRef = useRef<Set<string>>(new Set());

  // 清理已删除列/按钮的 draft - 仅依赖 columns，避免 keystroke 全量对比
  useEffect(() => {
    const liveKeys = new Set<string>();
    for (const col of columns) {
      const sid = (col as TableColumnItem & { __stableId?: string }).__stableId;
      if (!sid) continue;
      liveKeys.add(`${sid}__title`);
      liveKeys.add(`${sid}__key`);
      liveKeys.add(`${sid}__dataIndex`);
      liveKeys.add(`${sid}__textTemplate`);
      liveKeys.add(`${sid}__width`);
      if ('buttons' in col && Array.isArray((col as { buttons?: unknown[] }).buttons)) {
        const buttons = (col as { buttons: Array<{ __stableId?: string }> }).buttons;
        for (const b of buttons) {
          if (b.__stableId) {
            liveKeys.add(`${b.__stableId}__label`);
          }
        }
      }
    }
    setDrafts((prev) => {
      let needClean = false;
      for (const k of Object.keys(prev)) {
        if (!liveKeys.has(k)) {
          needClean = true;
          break;
        }
      }
      if (!needClean) return prev;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (liveKeys.has(k)) next[k] = v;
      }
      return next;
    });
    prevStableIdsRef.current = liveKeys;
  }, [columns]);

  const getDraftKey = useCallback(
    (stableId: string | undefined, field: string, fallbackIndex: number) => {
      const sid = stableId ?? `idx_${fallbackIndex}`;
      return `${sid}__${field}`;
    },
    [],
  );

  const getDraftValue = useCallback(
    (stableId: string | undefined, field: string, fallbackIndex: number, realValue: string) => {
      const key = getDraftKey(stableId, field, fallbackIndex);
      return drafts[key] !== undefined ? drafts[key] : realValue;
    },
    [drafts, getDraftKey],
  );

  const setDraftValue = useCallback(
    (stableId: string | undefined, field: string, fallbackIndex: number, nextValue: string) => {
      const key = getDraftKey(stableId, field, fallbackIndex);
      setDrafts((prev) => ({ ...prev, [key]: nextValue }));
    },
    [getDraftKey],
  );

  const commitDraft = useCallback(
    (
      stableId: string | undefined,
      field: string,
      fallbackIndex: number,
      handleCommit: (val: string) => void,
    ) => {
      const key = getDraftKey(stableId, field, fallbackIndex);
      if (drafts[key] !== undefined) {
        const val = drafts[key];
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        handleCommit(val);
      }
    },
    [drafts, getDraftKey],
  );

  const emitColumns = useCallback(
    (nextColumns: TableColumnItem[]) => {
      onChange(sanitizeTableColumnsValue(nextColumns, template));
    },
    [onChange, template],
  );

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
        if (field === 'width') {
          return { ...column, width: toWidth(nextValue) };
        }

        if (field === 'align') {
          return {
            ...column,
            align: nextValue ? (nextValue as TableColumnAlign) : undefined,
          };
        }

        if (field === 'dataIndex' && isTableActionColumn(column)) {
          return column;
        }

        return {
          ...column,
          [field]: nextValue,
        };
      });
    },
    [updateColumn],
  );

  const handleLinkTextModeChange = useCallback(
    (index: number, nextValue: string) => {
      updateColumn(index, (column) => {
        if (!isTableLinkColumn(column)) {
          return column;
        }

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
        isTableLinkColumn(column)
          ? {
              ...column,
              textTemplate: nextValue,
            }
          : column,
      );
    },
    [updateColumn],
  );

  const handleLinkActionsChange = useCallback(
    (index: number, nextValue: unknown) => {
      updateColumn(index, (column) =>
        isTableLinkColumn(column)
          ? {
              ...column,
              actions: nextValue as never,
            }
          : column,
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
          ? {
              ...column,
              buttons: column.buttons.filter((_, index) => index !== buttonIndex),
            }
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
        if (!isTableActionColumn(column)) {
          return column;
        }

        return {
          ...column,
          buttons: column.buttons.map((button, index) =>
            index === buttonIndex
              ? {
                  ...button,
                  [field]: nextValue,
                }
              : button,
          ),
        };
      });
    },
    [updateColumn],
  );

  const handleActionButtonActionsChange = useCallback(
    (columnIndex: number, buttonIndex: number, nextValue: unknown) => {
      updateColumn(columnIndex, (column) => {
        if (!isTableActionColumn(column)) {
          return column;
        }

        return {
          ...column,
          buttons: column.buttons.map((button, index) =>
            index === buttonIndex
              ? {
                  ...button,
                  actions: nextValue as never,
                }
              : button,
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

        {columns.map((column, index) => {
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
                <button type="button" onClick={() => handleRemoveColumn(index)}>
                  删除
                </button>
              </div>

              <div className={styles.complexEditorGrid}>
                <select
                  aria-label={`列${index + 1}类型`}
                  value={column.kind ?? 'data'}
                  onChange={(event) =>
                    handleKindChange(index, event.target.value as TableColumnKind)
                  }
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  aria-label={`列${index + 1}标题`}
                  value={getDraftValue(stableId, 'title', index, column.title)}
                  onChange={(event) => setDraftValue(stableId, 'title', index, event.target.value)}
                  onBlur={() =>
                    commitDraft(stableId, 'title', index, (val) =>
                      handleFieldChange(index, 'title', val),
                    )
                  }
                  placeholder="标题"
                />

                {!isTableActionColumn(column) && (
                  <input
                    aria-label={`列${index + 1}字段`}
                    value={getDraftValue(stableId, 'dataIndex', index, column.dataIndex)}
                    onChange={(event) =>
                      setDraftValue(stableId, 'dataIndex', index, event.target.value)
                    }
                    onBlur={() =>
                      commitDraft(stableId, 'dataIndex', index, (val) =>
                        handleFieldChange(index, 'dataIndex', val),
                      )
                    }
                    placeholder="dataIndex"
                  />
                )}

                <input
                  aria-label={`列${index + 1}键名`}
                  value={getDraftValue(stableId, 'key', index, column.key)}
                  onChange={(event) => setDraftValue(stableId, 'key', index, event.target.value)}
                  onBlur={() =>
                    commitDraft(stableId, 'key', index, (val) =>
                      handleFieldChange(index, 'key', val),
                    )
                  }
                  placeholder="key"
                />

                <input
                  type="number"
                  aria-label={`列${index + 1}宽度`}
                  value={getDraftValue(
                    stableId,
                    'width',
                    index,
                    column.width != null ? String(column.width) : '',
                  )}
                  onChange={(event) => setDraftValue(stableId, 'width', index, event.target.value)}
                  onBlur={() =>
                    commitDraft(stableId, 'width', index, (val) =>
                      handleFieldChange(index, 'width', val),
                    )
                  }
                  placeholder="宽度"
                  min={1}
                />

                <select
                  aria-label={`列${index + 1}对齐`}
                  value={column.align ?? ''}
                  onChange={(event) => handleFieldChange(index, 'align', event.target.value)}
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
                      onChange={(event) => handleLinkTextModeChange(index, event.target.value)}
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
                        value={getDraftValue(
                          stableId,
                          'textTemplate',
                          index,
                          typeof column.textTemplate === 'string' ? column.textTemplate : '',
                        )}
                        onChange={(event) =>
                          setDraftValue(stableId, 'textTemplate', index, event.target.value)
                        }
                        onBlur={() =>
                          commitDraft(stableId, 'textTemplate', index, (val) =>
                            handleLinkTextTemplateChange(index, val),
                          )
                        }
                        placeholder="{{value}} 或 {{record.name}}"
                      />
                    )}
                  </div>

                  <JsonEditor
                    label="点击动作"
                    value={column.actions}
                    onChange={(nextValue) => handleLinkActionsChange(index, nextValue)}
                    defaultTemplate={[]}
                    description="使用现有 ActionList，例如 navigate / feedback / setValue"
                  />
                </div>
              )}

              {isTableActionColumn(column) && (
                <div className={styles.complexEditor}>
                  <div className={styles.complexEditorActions}>
                    <button type="button" onClick={() => handleAddActionButton(index)}>
                      新增按钮
                    </button>
                  </div>

                  {column.buttons.length === 0 ? (
                    <div className={styles.complexEditorEmpty}>
                      暂无按钮，点击“新增按钮”开始配置。
                    </div>
                  ) : (
                    column.buttons.map((button, buttonIndex) => {
                      const btnStableId = (button as { __stableId?: string }).__stableId;
                      const btnKey = btnStableId ?? `${button.label}-${buttonIndex}`;
                      return (
                        <div className={styles.complexEditorCard} key={btnKey}>
                          <div className={styles.complexEditorCardHeader}>
                            <span>按钮 {buttonIndex + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveActionButton(index, buttonIndex)}
                            >
                              删除
                            </button>
                          </div>

                          <div className={styles.complexEditorGrid}>
                            <input
                              aria-label={`列${index + 1}按钮${buttonIndex + 1}文本`}
                              value={button.label}
                              onChange={(event) =>
                                handleActionButtonFieldChange(
                                  index,
                                  buttonIndex,
                                  'label',
                                  event.target.value,
                                )
                              }
                              placeholder="按钮文本"
                            />

                            <select
                              aria-label={`列${index + 1}按钮${buttonIndex + 1}类型`}
                              value={button.buttonType ?? 'text'}
                              onChange={(event) =>
                                handleActionButtonFieldChange(
                                  index,
                                  buttonIndex,
                                  'buttonType',
                                  event.target.value,
                                )
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
                              aria-label={`列${index + 1}按钮${buttonIndex + 1}危险样式`}
                              checked={button.danger ?? false}
                              onChange={(event) =>
                                handleActionButtonFieldChange(
                                  index,
                                  buttonIndex,
                                  'danger',
                                  event.target.checked,
                                )
                              }
                            />
                            危险样式
                          </label>

                          <JsonEditor
                            label="按钮动作"
                            value={button.actions}
                            onChange={(nextValue) =>
                              handleActionButtonActionsChange(index, buttonIndex, nextValue)
                            }
                            defaultTemplate={[]}
                            description="使用现有 ActionList，例如 navigate / feedback / dialog"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
