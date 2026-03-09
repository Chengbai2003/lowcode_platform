import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../PropertyPanel.module.scss';

interface JsonEditorProps {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  description?: string;
  placeholder?: string;
}

function toJsonString(value: unknown): string {
  if (value === undefined) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  label,
  value,
  onChange,
  description,
  placeholder,
}) => {
  const externalValue = useMemo(() => toJsonString(value), [value]);
  const [text, setText] = useState<string>(externalValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(externalValue);
    setError(null);
  }, [externalValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (error) setError(null);
  }, [error]);

  const handleBlur = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(undefined);
      setError(null);
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      onChange(parsed);
      setError(null);
    } catch {
      setError('JSON 格式不合法');
    }
  }, [text, onChange]);

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
      <div className={styles.propertyInput}>
        <textarea
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder || '请输入合法 JSON，例如 {"span": 12}'}
        />
        {error && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#cf1322' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
