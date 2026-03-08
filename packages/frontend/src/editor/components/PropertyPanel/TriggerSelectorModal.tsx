import React from "react";
import { X, MousePointerClick } from "lucide-react";
import styles from "./PropertyPanel.module.scss";

interface TriggerSelectorModalProps {
  onClose: () => void;
  onSelect: (trigger: string) => void;
}

const TRIGGER_OPTIONS = [
  { value: "onClick", label: "onClick", desc: "点击时触发" },
  { value: "onDoubleClick", label: "onDoubleClick", desc: "双击时触发" },
  { value: "onMouseEnter", label: "onMouseEnter", desc: "鼠标移入时触发" },
  { value: "onMouseLeave", label: "onMouseLeave", desc: "鼠标移出时触发" },
  { value: "onChange", label: "onChange", desc: "值改变时触发" },
  { value: "onSubmit", label: "onSubmit", desc: "提交时触发" },
  { value: "onFocus", label: "onFocus", desc: "获得焦点时触发" },
  { value: "onBlur", label: "onBlur", desc: "失去焦点时触发" },
  { value: "onKeyDown", label: "onKeyDown", desc: "按键按下时触发" },
  { value: "onScroll", label: "onScroll", desc: "滚动时触发" },
];

export const TriggerSelectorModal: React.FC<TriggerSelectorModalProps> = ({
  onClose,
  onSelect,
}) => {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.actionSelectorModal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>选择事件类型</h3>
            <p className={styles.modalDesc}>选择要监听的事件触发器</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Trigger Grid */}
        <div className={styles.actionGrid}>
          {TRIGGER_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={styles.actionOption}
              onClick={() => onSelect(option.value)}
            >
              <div className={`${styles.actionOptionIcon} bg-blue-100 text-blue-600`}>
                <MousePointerClick size={16} />
              </div>
              <span className={styles.actionOptionTitle}>{option.label}</span>
              <span className={styles.actionOptionDesc}>{option.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};