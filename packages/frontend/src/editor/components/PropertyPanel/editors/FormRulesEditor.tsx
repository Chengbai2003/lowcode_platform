import React, { useCallback, useMemo } from 'react';
import styles from '../PropertyPanel.module.scss';
import {
  createDefaultFormRule,
  sanitizeFormRulesValue,
  type FormRuleItem,
} from './complexValueUtils';

interface FormRulesEditorProps {
  label: string;
  value: unknown;
  onChange: (value: FormRuleItem[]) => void;
  description?: string;
  defaultTemplate?: unknown;
}

const TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '无', value: '' },
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'array', value: 'array' },
  { label: 'object', value: 'object' },
  { label: 'email', value: 'email' },
  { label: 'url', value: 'url' },
];

const TRIGGER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'onChange', value: 'onChange' },
  { label: 'onBlur', value: 'onBlur' },
  { label: 'onSubmit', value: 'onSubmit' },
];

export const FormRulesEditor: React.FC<FormRulesEditorProps> = ({
  label,
  value,
  onChange,
  description,
  defaultTemplate,
}) => {
  const template = useMemo(() => sanitizeFormRulesValue(defaultTemplate, []), [defaultTemplate]);
  const rules = useMemo(() => sanitizeFormRulesValue(value, template), [value, template]);

  const emitRules = useCallback(
    (nextRules: FormRuleItem[]) => {
      onChange(sanitizeFormRulesValue(nextRules, template));
    },
    [onChange, template],
  );

  const handleAddRule = useCallback(() => {
    emitRules([...rules, createDefaultFormRule()]);
  }, [emitRules, rules]);

  const handleResetTemplate = useCallback(() => {
    emitRules(template.length > 0 ? template : [createDefaultFormRule()]);
  }, [emitRules, template]);

  const handleRemoveRule = useCallback(
    (index: number) => {
      emitRules(rules.filter((_, i) => i !== index));
    },
    [emitRules, rules],
  );

  const handleRuleChange = useCallback(
    (index: number, updater: (rule: FormRuleItem) => FormRuleItem) => {
      emitRules(
        rules.map((rule, i) => {
          if (i !== index) return rule;
          return updater(rule);
        }),
      );
    },
    [emitRules, rules],
  );

  return (
    <div className={styles.propertyItem}>
      <label className={styles.propertyLabel}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>

      <div className={styles.complexEditor}>
        <div className={styles.complexEditorActions}>
          <button type="button" onClick={handleAddRule}>
            新增规则
          </button>
          <button type="button" onClick={handleResetTemplate}>
            恢复模板
          </button>
        </div>

        {rules.length === 0 && (
          <div className={styles.complexEditorEmpty}>暂无规则，点击“新增规则”</div>
        )}

        {rules.map((rule, index) => (
          <div
            className={styles.complexEditorCard}
            key={`form-rule-${index}`}
            data-testid={`form-rule-row-${index}`}
          >
            <div className={styles.complexEditorCardHeader}>
              <span>规则 {index + 1}</span>
              <button type="button" onClick={() => handleRemoveRule(index)}>
                删除
              </button>
            </div>
            <div className={styles.formRulesGrid}>
              <label className={styles.checkboxInline}>
                <input
                  type="checkbox"
                  aria-label={`规则${index + 1}必填`}
                  checked={Boolean(rule.required)}
                  onChange={(e) =>
                    handleRuleChange(index, (prevRule) => ({
                      ...prevRule,
                      required: e.target.checked,
                    }))
                  }
                />
                <span>必填</span>
              </label>
              <input
                aria-label={`规则${index + 1}提示`}
                value={rule.message ?? ''}
                onChange={(e) =>
                  handleRuleChange(index, (prevRule) => ({
                    ...prevRule,
                    message: e.target.value,
                  }))
                }
                placeholder="提示文案"
              />
              <select
                aria-label={`规则${index + 1}类型`}
                value={rule.type ?? ''}
                onChange={(e) =>
                  handleRuleChange(index, (prevRule) => ({
                    ...prevRule,
                    type: e.target.value || undefined,
                  }))
                }
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`规则${index + 1}触发`}
                value={rule.trigger ?? 'onChange'}
                onChange={(e) =>
                  handleRuleChange(index, (prevRule) => ({
                    ...prevRule,
                    trigger: e.target.value || 'onChange',
                  }))
                }
              >
                {TRIGGER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
