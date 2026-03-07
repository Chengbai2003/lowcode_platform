import React, { useCallback } from "react";
import styles from "../PropertyPanel.module.css";

interface StringEditorProps {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  description?: string;
  multiline?: boolean;
  placeholder?: string;
}

export const StringEditor: React.FC<StringEditorProps> = ({
  label,
  value,
  onChange,
  description,
  multiline = false,
  placeholder,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const stringValue = value?.toString() ?? "";

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && (
          <span className={styles.description}>{description}</span>
        )}
      </label>
      <div className={styles.propertyInput}>
        {multiline ? (
          <textarea
            value={stringValue}
            onChange={handleChange}
            placeholder={placeholder}
          />
        ) : (
          <input
            type="text"
            value={stringValue}
            onChange={handleChange}
            placeholder={placeholder}
          />
        )}
      </div>
    </div>
  );
};
