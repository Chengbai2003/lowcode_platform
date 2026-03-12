import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../PropertyPanel.module.scss';
import { sanitizeSlotValue } from './complexValueUtils';

interface SlotEditorProps {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  defaultTemplate?: unknown;
}

export const SlotEditor: React.FC<SlotEditorProps> = ({
  label,
  value,
  onChange,
  description,
  placeholder,
  defaultTemplate,
}) => {
  const fallback = useMemo(() => sanitizeSlotValue(defaultTemplate, ''), [defaultTemplate]);
  const externalValue = useMemo(() => sanitizeSlotValue(value, fallback), [value, fallback]);
  const [text, setText] = useState(externalValue);

  useEffect(() => {
    setText(externalValue);
  }, [externalValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setText(nextValue);
      onChange(nextValue);
    },
    [onChange],
  );

  const handleReset = useCallback(() => {
    setText(fallback);
    onChange(fallback);
  }, [fallback, onChange]);

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
      <div className={styles.complexEditor}>
        <div className={styles.complexEditorActions}>
          <button type="button" onClick={handleReset}>
            恢复默认内容
          </button>
        </div>
        <div className={styles.propertyInput}>
          <textarea
            value={text}
            onChange={handleChange}
            placeholder={placeholder || '输入默认插槽内容'}
          />
        </div>
      </div>
    </div>
  );
};
