import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../PropertyPanel.module.scss';
import { sanitizeJsonValue } from './complexValueUtils';
import { isExpression } from '../../../../renderer/executor/parser/expressionParser';

interface JsonEditorProps {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  description?: string;
  placeholder?: string;
  defaultTemplate?: unknown;
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
  defaultTemplate,
}) => {
  const externalValue = useMemo(() => toJsonString(value), [value]);
  const [text, setText] = useState<string>(externalValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(externalValue);
    setError(null);
  }, [externalValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      if (error) setError(null);
    },
    [error],
  );

  const handleBlur = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(undefined);
      setError(null);
      return;
    }

    if (isExpression(trimmed)) {
      onChange(trimmed);
      setError(null);
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (defaultTemplate !== undefined) {
        const normalized = sanitizeJsonValue(parsed, defaultTemplate);
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
          onChange(normalized);
          setError('JSON 类型与默认模板不匹配，已回退默认值');
          return;
        }
      }

      onChange(parsed);
      setError(null);
    } catch {
      if (defaultTemplate !== undefined) {
        onChange(sanitizeJsonValue(undefined, defaultTemplate));
        setError('JSON 格式不合法，已回退默认值');
        return;
      }
      setError('JSON 格式不合法');
    }
  }, [text, onChange, defaultTemplate]);

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
        {error && <div className={styles.editorError}>{error}</div>}
      </div>
    </div>
  );
};
