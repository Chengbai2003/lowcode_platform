import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../PropertyPanel.module.scss';
import { sanitizeExpressionValue } from './complexValueUtils';

interface ExpressionEditorProps {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
}

const PARTIAL_EXPRESSION_REGEX = /(\{\{)|(\}\})/;

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  label,
  value,
  onChange,
  description,
  placeholder,
}) => {
  const externalValue = useMemo(() => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('{{') && trimmed.endsWith('}}')
      ? trimmed.slice(2, -2).trim()
      : trimmed;
  }, [value]);

  const [text, setText] = useState(externalValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(externalValue);
    setError(null);
  }, [externalValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      if (error) setError(null);
    },
    [error],
  );

  const handleBlur = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange('');
      setError(null);
      return;
    }

    if (
      PARTIAL_EXPRESSION_REGEX.test(trimmed) &&
      !(trimmed.startsWith('{{') && trimmed.endsWith('}}'))
    ) {
      setError('表达式格式不合法，请使用 {{ ... }} 或输入纯表达式');
      return;
    }

    const normalized = sanitizeExpressionValue(trimmed);
    if (!normalized) {
      setError('表达式内容不能为空');
      return;
    }

    onChange(normalized);
    setError(null);
  }, [text, onChange]);

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
      <div className={styles.propertyInput}>
        <input
          type="text"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder || '例如 user.name 或 {{ user.name }}'}
        />
        <div className={styles.editorHint}>保存后会标准化为 {'{{ expression }}'} 形式</div>
        {error && <div className={styles.editorError}>{error}</div>}
      </div>
    </div>
  );
};
