import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import styles from '../PropertyPanel.module.scss';
import { JsonEditor } from './JsonEditor';
import {
  cloneInternalColumn,
  DEFAULT_TABLE_COLUMN,
  createDefaultTableActionButton,
  createDefaultTableColumn,
  isTableActionColumn,
  isTableLinkColumn,
  sanitizeTableColumnsValue,
  warnDuplicateKeys,
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
  sourceIdentity?: string;
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

// strip __stableId before external onChange (sanitize outputs retain it, so manual filter)
function stripStableIds(columns: TableColumnItem[]): TableColumnItem[] {
  return columns.map((col) => {
    const { __stableId: _colId, ...rest } = col as TableColumnItem & { __stableId?: string };
    if ('buttons' in rest && Array.isArray((rest as { buttons?: unknown[] }).buttons)) {
      const r = rest as unknown as { buttons: Array<{ __stableId?: string }> } & typeof rest;
      const buttons = r.buttons.map((b) => {
        const { __stableId: _bid, ...bRest } = b as { __stableId?: string } & Record<
          string,
          unknown
        >;
        return bRest;
      });
      return { ...rest, buttons } as unknown as TableColumnItem;
    }
    return rest as TableColumnItem;
  });
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
  // __stableId 本地 Map 映射：仅内部用于 React key 与 draft，不随 onChange 外泄
  // 5 步调和: legacy id -> unique key -> kind+dataIndex -> position -> UUID
  const stableIdByKeyRef = useRef<Map<string, string>>(new Map());
  const stableIdByKindDataRef = useRef<Map<string, string>>(new Map());
  const stableIdByPositionRef = useRef<Map<number, string>>(new Map());
  const stableButtonIdMapRef = useRef<Map<string, string>>(new Map());
  const prevSourceIdentityRef = useRef<string | undefined>(sourceIdentity);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // P1-10 跨组件隔离：sourceIdentity 变化时清空所有内部映射与 draft，避免串台
  useEffect(() => {
    if (prevSourceIdentityRef.current !== sourceIdentity) {
      prevSourceIdentityRef.current = sourceIdentity;
      stableIdByKeyRef.current.clear();
      stableIdByKindDataRef.current.clear();
      stableIdByPositionRef.current.clear();
      stableButtonIdMapRef.current.clear();
      setDrafts({});
    }
  }, [sourceIdentity]);
  const columns = useMemo(() => {
    const sanitized = sanitizeTableColumnsValue(value, template);
    const rawArr = Array.isArray(value) ? (value as unknown[]) : [];

    // 统计唯一性：仅唯一 key / 唯一 kind+dataIndex 才可作为身份依据
    const keyCount = new Map<string, number>();
    const kindDataCount = new Map<string, number>();
    for (const c of sanitized) {
      const k = (c as unknown as { key?: unknown }).key;
      if (typeof k === 'string') keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
      const kind = (c as unknown as { kind?: string }).kind ?? 'data';
      const di = (c as unknown as { dataIndex?: unknown }).dataIndex;
      if (typeof di === 'string' && di) {
        const kd = `${kind}:${di}`;
        kindDataCount.set(kd, (kindDataCount.get(kd) ?? 0) + 1);
      }
    }

    const seenSids = new Set<string>();
    const genNewSid = (): string => {
      try {
        const maybe =
          typeof crypto !== 'undefined' && (crypto as { randomUUID?: () => string }).randomUUID;
        if (maybe) return `col_${maybe.call(crypto)}`;
      } catch {}
      return `col_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    };
    const nextColumns = sanitized.map((col, idx) => {
      let sid = (col as unknown as { __stableId?: string }).__stableId;
      const rawItem = rawArr[idx] as Record<string, unknown> | undefined;

      // 1. legacy id 优先: raw 上的 __stableId / _stableId / _id
      let legacyId: string | undefined;
      if (rawItem) {
        if (typeof rawItem.__stableId === 'string' && (rawItem.__stableId as string).trim()) {
          legacyId = (rawItem.__stableId as string).trim();
        } else if (typeof rawItem._stableId === 'string' && (rawItem._stableId as string).trim()) {
          legacyId = (rawItem._stableId as string).trim();
        } else if (typeof rawItem._id === 'string' && (rawItem._id as string).trim()) {
          legacyId = (rawItem._id as string).trim();
        }
      }
      let reused = false;
      if (legacyId) {
        sid = legacyId;
        reused = true;
      } else {
        // 2. unique key
        const key = (col as unknown as { key?: unknown }).key;
        if (typeof key === 'string' && keyCount.get(key) === 1) {
          const prev = stableIdByKeyRef.current.get(key);
          if (prev) {
            sid = prev;
            reused = true;
          }
        }
        // 3. kind+dataIndex 唯一
        if (!reused) {
          const kind = (col as unknown as { kind?: string }).kind ?? 'data';
          const di = (col as unknown as { dataIndex?: unknown }).dataIndex;
          if (typeof di === 'string' && di) {
            const kd = `${kind}:${di}`;
            if (kindDataCount.get(kd) === 1) {
              const prev2 = stableIdByKindDataRef.current.get(kd);
              if (prev2) {
                sid = prev2;
                reused = true;
              }
            }
          }
        }
        // 4. position fallback
        if (!reused) {
          const prevPos = stableIdByPositionRef.current.get(idx);
          if (prevPos) {
            sid = prevPos;
            reused = true;
          }
        }
        // 5. UUID 已由 sanitize 生成，无需额外处理
      }

      // 去重 legacy 重复 __stableId：若本轮已见则重生成
      if (sid && seenSids.has(sid)) {
        sid = genNewSid();
      }
      if (sid) seenSids.add(sid);

      // 缓存映射供下次调和
      if (sid) {
        const key = (col as unknown as { key?: unknown }).key;
        if (typeof key === 'string') stableIdByKeyRef.current.set(key, sid);
        const kind = (col as unknown as { kind?: string }).kind ?? 'data';
        const di = (col as unknown as { dataIndex?: unknown }).dataIndex;
        if (typeof di === 'string' && di) {
          const kd = `${kind}:${di}`;
          stableIdByKindDataRef.current.set(kd, sid);
        }
        stableIdByPositionRef.current.set(idx, sid);
      }

      // Buttons 稳定化：类似调和，优先 legacy，其次 position
      if (
        isTableActionColumn(col as unknown as TableColumnItem) &&
        Array.isArray((col as unknown as { buttons?: unknown }).buttons)
      ) {
        const rawButtons =
          rawItem && Array.isArray(rawItem.buttons)
            ? (rawItem.buttons as Array<Record<string, unknown>>)
            : [];
        const sanitizedButtons = (
          col as unknown as { buttons: Array<Record<string, unknown> & { __stableId?: string }> }
        ).buttons;
        const nextButtons = sanitizedButtons.map((btn, bIdx) => {
          let bSid = (btn as { __stableId?: string }).__stableId;
          const rawBtn = rawButtons[bIdx] as Record<string, unknown> | undefined;
          let bLegacy: string | undefined;
          if (rawBtn) {
            if (typeof rawBtn.__stableId === 'string' && (rawBtn.__stableId as string).trim())
              bLegacy = (rawBtn.__stableId as string).trim();
            else if (typeof rawBtn._stableId === 'string' && (rawBtn._stableId as string).trim())
              bLegacy = (rawBtn._stableId as string).trim();
            else if (typeof rawBtn._id === 'string' && (rawBtn._id as string).trim())
              bLegacy = (rawBtn._id as string).trim();
          }
          if (bLegacy) {
            bSid = bLegacy;
          } else if (sid) {
            const cacheKey = `${sid}__btn-${bIdx}`;
            const cached = stableButtonIdMapRef.current.get(cacheKey);
            if (cached) bSid = cached;
          }
          if (sid && bSid) {
            const cacheKey = `${sid}__btn-${bIdx}`;
            stableButtonIdMapRef.current.set(cacheKey, bSid);
          }
          return {
            ...(btn as unknown as Record<string, unknown>),
            __stableId: bSid,
          } as unknown as typeof btn;
        });
        const withSidAndButtons = {
          ...(col as unknown as Record<string, unknown>),
          __stableId: sid,
          buttons: nextButtons,
        } as unknown as TableColumnItem;
        return cloneInternalColumn(withSidAndButtons) as TableColumnItem;
      }

      if (sid && sid !== (col as unknown as { __stableId?: string }).__stableId) {
        return cloneInternalColumn({
          ...(col as unknown as Record<string, unknown>),
          __stableId: sid,
        } as unknown as TableColumnItem) as TableColumnItem;
      }
      return col;
    });

    return nextColumns;
  }, [value, template]);

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
      const sanitized = sanitizeTableColumnsValue(nextColumns, template);
      // sanitize outputs retain __stableId — strip before external onChange (confirmed)
      const stripped = stripStableIds(sanitized);
      onChange(stripped as TableColumnItem[]);
    },
    [onChange, template],
  );

  // duplicate key 警告：新重复 key 提示但兼容 legacy（仅 console.warn，不阻断）
  useEffect(() => {
    warnDuplicateKeys(columns);
  }, [columns]);

  // 注意：不在组件 unmount 时向外发布 Schema（风险：切页/旧页写入），仅 blur/save flush

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
                              value={getDraftValue(
                                btnStableId,
                                'label',
                                index * 1000 + buttonIndex,
                                button.label,
                              )}
                              onChange={(event) =>
                                setDraftValue(
                                  btnStableId,
                                  'label',
                                  index * 1000 + buttonIndex,
                                  event.target.value,
                                )
                              }
                              onBlur={() =>
                                commitDraft(
                                  btnStableId,
                                  'label',
                                  index * 1000 + buttonIndex,
                                  (val) =>
                                    handleActionButtonFieldChange(index, buttonIndex, 'label', val),
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
