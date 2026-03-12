import React, { useCallback } from 'react';
import styles from '../PropertyPanel.module.scss';

interface NumberEditorProps {
  label: string;
  value: unknown;
  onChange: (value: number | undefined) => void;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const NumberEditor: React.FC<NumberEditorProps> = ({
  label,
  value,
  onChange,
  description,
  min,
  max,
  step = 1,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      if (input === '') {
        onChange(undefined);
        return;
      }
      const val = parseFloat(input);
      if (!isNaN(val)) {
        onChange(val);
      }
    },
    [onChange],
  );

  const numValue = typeof value === 'number' ? value : '';

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
      <div className={styles.propertyInput}>
        <input
          type="number"
          value={numValue}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
        />
      </div>
    </div>
  );
};
