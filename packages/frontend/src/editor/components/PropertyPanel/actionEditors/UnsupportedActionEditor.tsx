/**
 * 不支持的 Action 编辑器
 */
import styles from '../PropertyPanel.module.scss';

/** 不支持的 Action 类型占位编辑器 */
export const UnsupportedActionEditor = () => (
  <div className={styles.actionEditor}>
    <div className={styles.actionHint}>该动作暂未提供可视化配置</div>
  </div>
);
