import React, { useCallback } from 'react';
import { Select } from 'antd';
import styles from '../PropertyPanel.module.scss';

interface SelectEditorProps {
  label: string;
  value: unknown;
  onChange: (value: string | number) => void;
  options: Array<{ label: string; value: string | number }>;
  description?: string;
}

export const SelectEditor: React.FC<SelectEditorProps> = ({
  label,
  value,
  onChange,
  options,
  description,
}) => {
  const handleChange = useCallback(
    (val: string | number) => {
      onChange(val);
    },
    [onChange],
  );

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
      <div className={styles.propertyInput}>
        <Select
          size="small"
          value={value as string | number}
          onChange={handleChange}
          options={options}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
};
