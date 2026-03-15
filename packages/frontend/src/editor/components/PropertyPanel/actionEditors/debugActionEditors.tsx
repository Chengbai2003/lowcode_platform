/**
 * 调试类 Action 编辑器（Log, CustomScript）
 */
import {
  ActionUpdate,
  LogActionItem,
  CustomScriptActionItem,
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
          onChange={(event) => updateAction({ value: parseValueInput(event.target.value) })}
        />
      </div>
    </div>
  </div>
);

/** CustomScript 动作编辑器 */
export const CustomScriptActionEditor = ({
  action,
  updateAction,
}: {
  action: CustomScriptActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>脚本内容</label>
      <textarea
        value={action.code}
        aria-label="脚本内容"
        onChange={(event) => updateAction({ code: event.target.value })}
      />
    </div>
  </div>
);
