/**
 * 数据类 Action 编辑器（SetValue, ApiCall）
 */
import {
  ActionUpdate,
  SetValueActionItem,
  ApiCallActionItem,
  formatValue,
  parseValueInput,
} from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** SetValue 动作编辑器 */
export const SetValueActionEditor = ({
  action,
  updateAction,
}: {
  action: SetValueActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>字段路径</label>
      <input
        value={action.field}
        aria-label="字段路径"
        onChange={(event) => updateAction({ field: event.target.value })}
      />
    </div>
    <div className={styles.actionField}>
      <label>值</label>
      <input
        value={formatValue(action.value)}
        aria-label="字段值"
        onChange={(event) => updateAction({ value: parseValueInput(event.target.value) })}
      />
    </div>
    <label className={styles.checkboxInline}>
      <input
        type="checkbox"
        aria-label="合并对象"
        checked={Boolean(action.merge)}
        onChange={(event) => updateAction({ merge: event.target.checked })}
      />
      合并对象
    </label>
  </div>
);

/** ApiCall 动作编辑器 */
export const ApiCallActionEditor = ({
  action,
  updateAction,
}: {
  action: ApiCallActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>接口地址</label>
      <input
        value={formatValue(action.url)}
        aria-label="接口地址"
        onChange={(event) => updateAction({ url: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>方法</label>
        <select
          value={action.method ?? 'GET'}
          aria-label="请求方法"
          onChange={(event) =>
            updateAction({
              method: event.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            })
          }
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>
      <label className={styles.checkboxInline}>
        <input
          type="checkbox"
          aria-label="自动提示错误"
          checked={Boolean(action.showError)}
          onChange={(event) => updateAction({ showError: event.target.checked })}
        />
        自动提示错误
      </label>
    </div>
  </div>
);
