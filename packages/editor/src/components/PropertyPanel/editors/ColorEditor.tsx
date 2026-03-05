import React, { useCallback } from "react";
import styles from "../PropertyPanel.module.css";

interface ColorEditorProps {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  description?: string;
}

export const ColorEditor: React.FC<ColorEditorProps> = ({
  label,
  value,
  onChange,
  description,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const colorValue = value?.toString() ?? "#000000";

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && (
          <span className={styles.description}>{description}</span>
        )}
      </label>
      <div
        className={styles.propertyInput}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          type="color"
          value={colorValue}
          onChange={handleChange}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            border: "none",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={colorValue}
          onChange={handleChange}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
};
