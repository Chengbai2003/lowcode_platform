/**
 * 流程控制类 Action 编辑器（If, Loop, Delay）
 */
import type { JsonValue } from '@lowcode-platform/schema-contract';
import {
  ActionUpdate,
  IfActionItem,
  LoopActionItem,
  DelayActionItem,
  RunFlowActionItem,
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
        onChange={(event) =>
          updateAction({ condition: parseValueInput(event.target.value) as JsonValue })
        }
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
        onChange={(event) =>
          updateAction({ over: parseValueInput(event.target.value) as JsonValue })
        }
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

/** RunFlow 动作编辑器：只允许选择当前页面已经声明的流程。 */
export const RunFlowActionEditor = ({
  action,
  flowKeys,
  updateAction,
}: {
  action: RunFlowActionItem;
  flowKeys: readonly string[];
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>页面流程</label>
      <select
        aria-label="页面流程"
        value={action.flow}
        onChange={(event) => updateAction({ flow: event.target.value })}
      >
        {flowKeys.map((flowKey) => (
          <option key={flowKey} value={flowKey}>
            {flowKey}
          </option>
        ))}
      </select>
    </div>
    <div className={styles.actionField}>
      <label>输入（可选 JSON）</label>
      <input
        aria-label="流程输入"
        value={formatValue(action.input)}
        onChange={(event) =>
          updateAction({ input: parseValueInput(event.target.value) as JsonValue })
        }
      />
    </div>
  </div>
);
