/**
 * UI 类 Action 编辑器（Feedback, Dialog）
 */
import {
  ActionUpdate,
  FeedbackActionItem,
  DialogActionItem,
  formatValue,
  parseValueInput,
} from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** Feedback 动作编辑器 */
export const FeedbackActionEditor = ({
  action,
  updateAction,
}: {
  action: FeedbackActionItem;
  updateAction: ActionUpdate;
}) => {
  const kind = action.kind ?? 'message';
  const level = action.level ?? 'info';
  return (
    <div className={styles.actionEditor}>
      <div className={styles.actionFieldRow}>
        <div className={styles.actionField}>
          <label>提示类型</label>
          <select
            value={kind}
            aria-label="提示类型"
            onChange={(event) =>
              updateAction({
                kind: event.target.value as 'message' | 'notification',
              })
            }
          >
            <option value="message">message</option>
            <option value="notification">notification</option>
          </select>
        </div>
        <div className={styles.actionField}>
          <label>消息级别</label>
          <select
            value={level}
            aria-label="消息级别"
            onChange={(event) =>
              updateAction({
                level: event.target.value as 'success' | 'error' | 'warning' | 'info',
              })
            }
          >
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
        </div>
      </div>
      <div className={styles.actionField}>
        <label>提示内容</label>
        <input
          value={formatValue(action.content)}
          aria-label="提示内容"
          onChange={(event) => updateAction({ content: parseValueInput(event.target.value) })}
        />
      </div>
      {kind === 'notification' && (
        <div className={styles.actionField}>
          <label>标题</label>
          <input
            value={formatValue(action.title)}
            aria-label="提示标题"
            onChange={(event) => updateAction({ title: parseValueInput(event.target.value) })}
          />
        </div>
      )}
    </div>
  );
};

/** Dialog 动作编辑器 */
export const DialogActionEditor = ({
  action,
  updateAction,
}: {
  action: DialogActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>弹窗类型</label>
        <select
          value={action.kind}
          aria-label="弹窗类型"
          onChange={(event) =>
            updateAction({
              kind: event.target.value as 'modal' | 'confirm',
            })
          }
        >
          <option value="modal">modal</option>
          <option value="confirm">confirm</option>
        </select>
      </div>
      <div className={styles.actionField}>
        <label>标题</label>
        <input
          value={formatValue(action.title)}
          aria-label="弹窗标题"
          onChange={(event) => updateAction({ title: parseValueInput(event.target.value) })}
        />
      </div>
    </div>
    <div className={styles.actionField}>
      <label>内容</label>
      <input
        value={formatValue(action.content)}
        aria-label="弹窗内容"
        onChange={(event) => updateAction({ content: parseValueInput(event.target.value) })}
      />
    </div>
  </div>
);
