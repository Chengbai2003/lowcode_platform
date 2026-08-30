/**
 * 导航类 Action 编辑器（Navigate）
 */
import type { JsonValue } from '@lowcode-platform/schema-contract';
import { ActionUpdate, NavigateActionItem, formatValue, parseValueInput } from '../actionConfig';
import styles from '../PropertyPanel.module.scss';

/** Navigate 动作编辑器 */
export const NavigateActionEditor = ({
  action,
  updateAction,
}: {
  action: NavigateActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>跳转地址</label>
      <input
        value={formatValue(action.to)}
        aria-label="跳转地址"
        onChange={(event) => updateAction({ to: parseValueInput(event.target.value) as JsonValue })}
      />
    </div>
    <label className={styles.checkboxInline}>
      <input
        type="checkbox"
        aria-label="替换历史"
        checked={Boolean(action.replace)}
        onChange={(event) => updateAction({ replace: event.target.checked })}
      />
      替换历史记录
    </label>
  </div>
);
