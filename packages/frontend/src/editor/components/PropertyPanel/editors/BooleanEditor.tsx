import React, { useCallback } from "react";
import { Switch } from "antd";
import styles from "../PropertyPanel.module.scss";

interface BooleanEditorProps {
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
  description?: string;
}

export const BooleanEditor: React.FC<BooleanEditorProps> = ({
  label,
  value,
  onChange,
  description,
}) => {
  const handleChange = useCallback(
    (checked: boolean) => {
      onChange(checked);
    },
    [onChange],
  );

  const boolValue = Boolean(value);

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {description && (
            <span className={styles.description}>{description}</span>
          )}
          <Switch size="small" checked={boolValue} onChange={handleChange} />
        </div>
      </label>
    </div>
  );
};
