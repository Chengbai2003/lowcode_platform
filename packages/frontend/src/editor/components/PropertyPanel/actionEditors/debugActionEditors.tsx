/*

 * 调试类 Action 编辑器（Log, 历史 CustomScript 只读）
 */
import type { JsonValue } from '@lowcode-platform/schema-contract';
import {
  ActionUpdate,
  LogActionItem,
  HistoricCustomScriptActionItem,
  formatValue,
  parseValueInput,
} from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** Log 动作编辑器 */
export const LogActionEditor = ({
  action,
  updateAction,
}: {
  action: LogActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>日志级别</label>
        <select
          value={action.level ?? 'info'}
          aria-label="日志级别"
          onChange={(event) =>
            updateAction({
              level: event.target.value as 'log' | 'info' | 'warn' | 'error',
            })
          }
        >
          <option value="log">log</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>
      <div className={styles.actionField}>
        <label>日志内容</label>
        <input
          value={formatValue(action.value)}
          aria-label="日志内容"
          onChange={(event) =>
            updateAction({ value: parseValueInput(event.target.value) as JsonValue })
          }
        />
      </div>
    </div>
  </div>
);

/** 历史 CustomScript 只读提示（已永久禁用） */
export const CustomScriptActionEditor = ({
  action,
}: {
  action: HistoricCustomScriptActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionHint} style={{ color: '#dc2626' }}>
      该历史 customScript 动作已永久禁用，请删除后重新保存。
      {action.code ? `原代码长度 ${action.code.length}` : ''}
    </div>
  </div>
);
