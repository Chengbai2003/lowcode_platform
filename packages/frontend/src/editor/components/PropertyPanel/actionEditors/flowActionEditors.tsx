/**
 * 流程控制类 Action 编辑器（If, Loop, Delay）
 */
import {
  ActionUpdate,
  IfActionItem,
  LoopActionItem,
  DelayActionItem,
  formatValue,
  parseValueInput,
  parseNumberInput,
} from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** If 动作编辑器 */
export const IfActionEditor = ({
  action,
  updateAction,
}: {
  action: IfActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>条件</label>
      <input
        value={formatValue(action.condition)}
        aria-label="条件表达式"
        onChange={(event) => updateAction({ condition: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionHint}>子动作请在 JSON 模式下编辑</div>
  </div>
);

/** Loop 动作编辑器 */
export const LoopActionEditor = ({
  action,
  updateAction,
}: {
  action: LoopActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>遍历数据</label>
      <input
        value={formatValue(action.over)}
        aria-label="遍历数据"
        onChange={(event) => updateAction({ over: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>元素变量</label>
        <input
          value={action.itemVar}
          aria-label="元素变量"
          onChange={(event) => updateAction({ itemVar: event.target.value })}
        />
      </div>
      <div className={styles.actionField}>
        <label>索引变量</label>
        <input
          value={formatValue(action.indexVar)}
          aria-label="索引变量"
          onChange={(event) => updateAction({ indexVar: event.target.value || undefined })}
        />
      </div>
    </div>
    <div className={styles.actionHint}>子动作请在 JSON 模式下编辑</div>
  </div>
);

/** Delay 动作编辑器 */
export const DelayActionEditor = ({
  action,
  updateAction,
}: {
  action: DelayActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>延迟时间(ms)</label>
      <input
        type="number"
        aria-label="延迟时间"
        value={action.ms ?? ''}
        onChange={(event) => {
          const next = parseNumberInput(event.target.value);
          updateAction(next === undefined ? { ms: undefined } : { ms: next });
        }}
      />
    </div>
  </div>
);
