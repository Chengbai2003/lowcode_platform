/**
 * executeDataSource 动作编辑器（M1b-1 PR D / 计划 §4 最小查询动作配置）。
 *
 * 只做最小配置：sourceId 选择/内联新建声明（operation 来自服务端目录，
 * 绝不编辑 URL/headers——OperationRef 语义）、resultTo 选择已声明顶层
 * state、params 静态键值。未保存草稿/脏页显示「先保存再查询」——
 * 执行侧由预览适配器的绑定校验 fail-close 兜底（零 HTTP）。
 */

import { useCallback, useMemo, useState } from 'react';
import type { JsonValue } from '@lowcode-platform/schema-contract';
import type { DataSourceOperationSummary } from '../../../services/dataSourceCatalogApi';
import {
  ActionUpdate,
  ExecuteDataSourceActionItem,
  formatValue,
  parseValueInput,
} from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** 数据源编辑上下文：由编辑器顶层（LowcodeEditor）构造并逐层透传 */
export interface DataSourceEditorContext {
  readonly pageId: string | undefined;
  readonly pageVersion: number | null;
  /** 未保存草稿 / 脏页 / 切页 → 查询将被 fail-close 拒绝 */
  readonly queryBlocked: boolean;
  readonly queryBlockedReason: 'unsaved' | 'dirty' | null;
  /** 目录读取（真实 HTTP；需已保存版本） */
  readonly listOperations: () => Promise<readonly DataSourceOperationSummary[]>;
}

export interface DataSourceDeclarationDraft {
  readonly sourceId: string;
  readonly operationId: string;
  readonly revision: string;
  readonly params?: Readonly<Record<string, JsonValue>>;
}

interface ExecuteDataSourceActionEditorProps {
  action: ExecuteDataSourceActionItem;
  updateAction: ActionUpdate;
  dataSourceKeys: readonly string[];
  stateKeys: readonly string[];
  dataSourceEditor?: DataSourceEditorContext;
  onCreateDataSourceDeclaration?: (draft: DataSourceDeclarationDraft) => void;
  onCreateState?: (key: string, initialValue: JsonValue) => void;
}

export const ExecuteDataSourceActionEditor = ({
  action,
  updateAction,
  dataSourceKeys,
  stateKeys,
  dataSourceEditor,
  onCreateDataSourceDeclaration,
  onCreateState,
}: ExecuteDataSourceActionEditorProps) => {
  const [creating, setCreating] = useState(false);
  const [operations, setOperations] = useState<readonly DataSourceOperationSummary[] | null>(null);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [newSourceId, setNewSourceId] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [newStateKey, setNewStateKey] = useState('');
  const [paramRows, setParamRows] = useState<readonly { key: string; value: string }[]>([]);

  const loadOperations = useCallback(async () => {
    if (
      !dataSourceEditor ||
      dataSourceEditor.pageId == null ||
      dataSourceEditor.pageVersion == null
    ) {
      setOperationsError('先保存页面后才能读取操作目录（目录需要已保存的页面版本）');
      return;
    }
    setOperationsError(null);
    try {
      const list = await dataSourceEditor.listOperations();
      setOperations(list);
    } catch {
      setOperationsError('操作目录读取失败（身份未配置或网络错误）');
    }
  }, [dataSourceEditor]);

  const handleToggleCreating = useCallback(() => {
    setCreating((current) => {
      const next = !current;
      if (next && operations === null && operationsError === null) {
        void loadOperations();
      }
      return next;
    });
  }, [loadOperations, operations, operationsError]);

  const selectedOperationSummary = useMemo(
    () =>
      operations?.find((entry) => `${entry.operationId}@${entry.revision}` === selectedOperation),
    [operations, selectedOperation],
  );

  const handleCreateDeclaration = useCallback(() => {
    if (!onCreateDataSourceDeclaration || !selectedOperationSummary) return;
    const trimmedSourceId = newSourceId.trim();
    if (!trimmedSourceId) return;
    const params: Record<string, JsonValue> = {};
    for (const row of paramRows) {
      if (!row.key.trim()) continue;
      params[row.key.trim()] = parseValueInput(row.value) as JsonValue;
    }
    onCreateDataSourceDeclaration({
      sourceId: trimmedSourceId,
      operationId: selectedOperationSummary.operationId,
      revision: selectedOperationSummary.revision,
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    updateAction({ sourceId: trimmedSourceId } as Partial<ExecuteDataSourceActionItem>);
    setCreating(false);
    setNewSourceId('');
    setSelectedOperation('');
    setParamRows([]);
  }, [
    onCreateDataSourceDeclaration,
    newSourceId,
    paramRows,
    selectedOperationSummary,
    updateAction,
  ]);

  const handleCreateState = useCallback(() => {
    if (!onCreateState) return;
    const trimmed = newStateKey.trim();
    if (!trimmed) return;
    onCreateState(trimmed, [] as JsonValue);
    updateAction({ resultTo: `state.${trimmed}` } as Partial<ExecuteDataSourceActionItem>);
    setNewStateKey('');
  }, [newStateKey, onCreateState, updateAction]);

  return (
    <div className={styles.actionEditor}>
      {dataSourceEditor?.queryBlocked && (
        <div className={styles.actionField} data-testid="datasource-save-first-hint" role="status">
          <label>先保存再查询</label>
          <span>
            {dataSourceEditor.queryBlockedReason === 'dirty'
              ? '页面已有未保存修改：执行查询前需先保存（草稿执行被禁止）'
              : '页面尚未保存：执行查询前需先保存（草稿执行被禁止）'}
          </span>
        </div>
      )}

      <div className={styles.actionField}>
        <label>数据源声明（sourceId）</label>
        <select
          value={action.sourceId}
          aria-label="数据源声明"
          onChange={(event) =>
            updateAction({ sourceId: event.target.value } as Partial<ExecuteDataSourceActionItem>)
          }
        >
          <option value="">请选择…</option>
          {dataSourceKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <button type="button" className={styles.flowActionBtn} onClick={handleToggleCreating}>
          {creating ? '取消新建' : '新建查询'}
        </button>
      </div>

      {creating && (
        <div className={styles.actionField}>
          <label>操作（来自服务端可信目录）</label>
          {operationsError && <span>{operationsError}</span>}
          <select
            value={selectedOperation}
            aria-label="数据源操作"
            onChange={(event) => setSelectedOperation(event.target.value)}
          >
            <option value="">{operations === null ? '加载目录中…' : '请选择操作…'}</option>
            {(operations ?? []).map((entry) => (
              <option
                key={`${entry.operationId}@${entry.revision}`}
                value={`${entry.operationId}@${entry.revision}`}
              >
                {entry.title}（{entry.operationId} @ {entry.revision}）
              </option>
            ))}
          </select>
          <input
            value={newSourceId}
            aria-label="新数据源声明 ID"
            placeholder="声明 ID（如 searchItems）"
            onChange={(event) => setNewSourceId(event.target.value)}
          />
          {paramRows.map((row, index) => (
            <div className={styles.actionFieldRow} key={`param-${index}`}>
              <input
                value={row.key}
                aria-label={`参数名 ${index + 1}`}
                placeholder="参数名（如 query）"
                onChange={(event) =>
                  setParamRows((rows) =>
                    rows.map((item, i) =>
                      i === index ? { ...item, key: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                value={row.value}
                aria-label={`参数值 ${index + 1}`}
                placeholder="静态值（字符串或 JSON）"
                onChange={(event) =>
                  setParamRows((rows) =>
                    rows.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            className={styles.flowActionBtn}
            onClick={() => setParamRows((rows) => [...rows, { key: '', value: '' }])}
          >
            添加参数
          </button>
          <button
            type="button"
            className={styles.flowActionBtn}
            disabled={!newSourceId.trim() || !selectedOperation}
            onClick={handleCreateDeclaration}
          >
            创建声明并绑定
          </button>
        </div>
      )}

      <div className={styles.actionField}>
        <label>结果写入（resultTo，已声明顶层 state）</label>
        <select
          value={action.resultTo}
          aria-label="结果写入目标"
          onChange={(event) =>
            updateAction({ resultTo: event.target.value } as Partial<ExecuteDataSourceActionItem>)
          }
        >
          <option value="">请选择…</option>
          {stateKeys.map((key) => (
            <option key={key} value={`state.${key}`}>
              state.{key}
            </option>
          ))}
        </select>
        <input
          value={newStateKey}
          aria-label="新 state 键"
          placeholder="新建 state 键（初始值 []）"
          onChange={(event) => setNewStateKey(event.target.value)}
        />
        <button
          type="button"
          className={styles.flowActionBtn}
          disabled={!newStateKey.trim()}
          onClick={handleCreateState}
        >
          新建并绑定
        </button>
      </div>

      <div className={styles.actionField}>
        <label>当前绑定</label>
        <span data-testid="datasource-current-binding">
          {formatValue(action.sourceId || '未选择')} → {formatValue(action.resultTo || '未选择')}
        </span>
      </div>
    </div>
  );
};
