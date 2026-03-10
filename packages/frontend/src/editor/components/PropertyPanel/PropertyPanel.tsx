import React, { useMemo, useCallback, useState } from 'react';
import { Collapse } from 'antd';
import type { A2UISchema, PropertyMeta } from '../../../types';
import { getComponentMeta } from '../../../components';
import { StringEditor } from './editors/StringEditor';
import { NumberEditor } from './editors/NumberEditor';
import { BooleanEditor } from './editors/BooleanEditor';
import { SelectEditor } from './editors/SelectEditor';
import { ColorEditor } from './editors/ColorEditor';
import { JsonEditor } from './editors/JsonEditor';
import { TableColumnsEditor } from './editors/TableColumnsEditor';
import { FormRulesEditor } from './editors/FormRulesEditor';
import { ExpressionEditor } from './editors/ExpressionEditor';
import { SlotEditor } from './editors/SlotEditor';
import { NoSelectionEmptyState } from '../EmptyState';
import { EventConfigPanel } from './EventConfigPanel';
import {
  DEFAULT_TABLE_COLUMN,
  sanitizeExpressionValue,
  sanitizeFormRulesValue,
  sanitizeJsonValue,
  sanitizeSlotValue,
  sanitizeTableColumnsValue,
} from './editors/complexValueUtils';
import { isExpression } from '../../../renderer/executor/parser/expressionParser';
import styles from './PropertyPanel.module.scss';

interface PropertyPanelProps {
  schema: A2UISchema | null;
  selectedId: string | null;
  onSchemaChange: (schema: A2UISchema) => void;
}

const EXPRESSION_HINT_KEYS = new Set([
  'className',
  'style',
  'children',
  'title',
  'content',
  'placeholder',
  'label',
  'text',
  'message',
  'description',
  'tip',
  'header',
  'footer',
  'subTitle',
  'extra',
  'tooltip',
]);

function normalizePropertyValue(prop: PropertyMeta, value: unknown): unknown {
  switch (prop.editor) {
    case 'tableColumns': {
      const fallback = sanitizeTableColumnsValue(prop.defaultValue, [DEFAULT_TABLE_COLUMN]);
      return sanitizeTableColumnsValue(value, fallback);
    }
    case 'formRules': {
      const fallback = sanitizeFormRulesValue(prop.defaultValue, []);
      return sanitizeFormRulesValue(value, fallback);
    }
    case 'json':
      if (typeof value === 'string' && isExpression(value)) {
        return value;
      }
      return sanitizeJsonValue(value, prop.defaultValue);
    case 'expression':
      return sanitizeExpressionValue(
        value,
        typeof prop.defaultValue === 'string' ? prop.defaultValue : '',
      );
    case 'slot':
      return sanitizeSlotValue(
        value,
        typeof prop.defaultValue === 'string' ? prop.defaultValue : '',
      );
    default:
      // Primitive editors (`string/number/boolean/select/color`) already provide typed values.
      // Keep raw value here to avoid unintended coercion.
      return value;
  }
}

/**
 * 属性面板组件
 * 根据选中组件的元数据动态渲染属性编辑器
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  schema,
  selectedId,
  onSchemaChange,
}) => {
  const [activeTab, setActiveTab] = useState<'props' | 'events'>('props');
  // 获取选中组件的配置
  const componentConfig = useMemo(() => {
    if (!schema || !selectedId) return null;
    const component = schema.components[selectedId];
    if (!component) return null;
    const meta = getComponentMeta(component.type);
    if (!meta) return null;
    return { component, meta };
  }, [schema, selectedId]);

  // 按分组组织属性
  const groupedProperties = useMemo(() => {
    if (!componentConfig) return {};
    const { component, meta } = componentConfig;
    const groups: Record<string, PropertyMeta[]> = {
      基础: [],
      样式: [],
      高级: [],
    };

    const resolvedProps = meta.properties.reduce<Record<string, unknown>>((acc, prop) => {
      const currentValue = component.props?.[prop.key];
      acc[prop.key] = currentValue ?? prop.defaultValue;
      return acc;
    }, {});

    const visibleProperties = meta.properties.filter((prop) => {
      if (!prop.visible) return true;
      try {
        return Boolean(prop.visible(resolvedProps));
      } catch {
        return false;
      }
    });

    visibleProperties.forEach((prop) => {
      const group = prop.group || '基础';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(prop);
    });
    // 移除空分组
    return Object.fromEntries(Object.entries(groups).filter(([, props]) => props.length > 0));
  }, [componentConfig]);

  // 处理属性变更
  const handlePropertyChange = useCallback(
    (prop: PropertyMeta, value: unknown) => {
      if (!schema || !selectedId) return;
      const component = schema.components[selectedId];
      if (!component) return;
      const key = prop.key;
      const prevProps = component.props || {};
      const nextProps = { ...prevProps };
      const normalizedValue = normalizePropertyValue(prop, value);

      if (normalizedValue === undefined) {
        delete nextProps[key];
      } else {
        nextProps[key] = normalizedValue;
      }

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...component,
            props: nextProps,
          },
        },
      };
      onSchemaChange(newSchema);
    },
    [schema, selectedId, onSchemaChange],
  );

  // 渲染单个属性编辑器
  const renderEditor = useCallback(
    (prop: PropertyMeta) => {
      if (!componentConfig) return null;
      const { component } = componentConfig;
      const rawValue = component.props?.[prop.key] ?? prop.defaultValue;
      const value = normalizePropertyValue(prop, rawValue);
      const description =
        EXPRESSION_HINT_KEYS.has(prop.key) && prop.editor !== 'expression'
          ? prop.description
            ? `${prop.description}（支持 {{}} 表达式）`
            : '支持 {{}} 表达式'
          : prop.description;

      const commonProps = {
        label: prop.label,
        value,
        onChange: (val: unknown) => handlePropertyChange(prop, val),
        description,
      };

      switch (prop.editor) {
        case 'string':
          return <StringEditor key={prop.key} {...commonProps} />;
        case 'number':
          return <NumberEditor key={prop.key} {...commonProps} />;
        case 'boolean':
          return <BooleanEditor key={prop.key} {...commonProps} />;
        case 'select':
          return <SelectEditor key={prop.key} {...commonProps} options={prop.options || []} />;
        case 'color':
          return <ColorEditor key={prop.key} {...commonProps} />;
        case 'json':
          return <JsonEditor key={prop.key} {...commonProps} defaultTemplate={prop.defaultValue} />;
        case 'tableColumns':
          return (
            <TableColumnsEditor
              key={prop.key}
              {...commonProps}
              defaultTemplate={prop.defaultValue}
            />
          );
        case 'formRules':
          return (
            <FormRulesEditor key={prop.key} {...commonProps} defaultTemplate={prop.defaultValue} />
          );
        case 'expression':
          return <ExpressionEditor key={prop.key} {...commonProps} />;
        case 'slot':
          if (prop.key === 'children') {
            const hasChildrenIds =
              Array.isArray(component.childrenIds) && component.childrenIds.length > 0;
            const slotText = sanitizeSlotValue(rawValue, '');
            const hasSlotText = slotText.trim().length > 0;
            const showConflictHint = hasChildrenIds && hasSlotText;

            return (
              <div key={prop.key} className={styles.slotEditorWithHint}>
                {showConflictHint && (
                  <div className={styles.slotConflictHint}>
                    <div className={styles.slotConflictTitle}>插槽内容与子组件同时存在</div>
                    <div className={styles.slotConflictBody}>
                      渲染策略：先渲染插槽文本，再追加子组件树。表单输入类组件会忽略
                      childrenIds。
                    </div>
                  </div>
                )}
                <SlotEditor
                  {...commonProps}
                  defaultTemplate={prop.defaultValue}
                  placeholder="输入默认插槽内容（组件树子节点会附加在后）"
                />
              </div>
            );
          }
          return (
            <SlotEditor
              key={prop.key}
              {...commonProps}
              defaultTemplate={prop.defaultValue}
              placeholder="输入默认插槽内容（组件树子节点会附加在后）"
            />
          );
        default:
          return null;
      }
    },
    [componentConfig, handlePropertyChange],
  );

  const collapseItems = useMemo(
    () =>
      Object.entries(groupedProperties).map(([groupName, properties]) => ({
        key: groupName,
        label: <span className={styles.groupHeader}>{groupName}</span>,
        className: styles.collapsePanel,
        children: (
          <div className={styles.propertiesList}>
            {properties.map((prop) => renderEditor(prop))}
          </div>
        ),
      })),
    [groupedProperties, renderEditor],
  );

  // 空状态
  if (!componentConfig) {
    return (
      <div className={styles.propertyPanel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>属性面板</span>
        </div>
        <div className={styles.panelBody}>
          <NoSelectionEmptyState />
        </div>
      </div>
    );
  }

  const { component, meta } = componentConfig;

  return (
    <div className={styles.propertyPanel}>
      {/* Tab 切换 */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === 'props' ? styles.active : ''}`}
          onClick={() => setActiveTab('props')}
        >
          属性
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'events' ? styles.active : ''}`}
          onClick={() => setActiveTab('events')}
        >
          事件
        </button>
      </div>

      {activeTab === 'props' ? (
        <>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>{meta.displayName}</span>
            <span className={styles.componentId}>{component.id}</span>
          </div>
          <div className={styles.panelBody}>
            <Collapse
              defaultActiveKey={Object.keys(groupedProperties)}
              ghost
              expandIconPosition="end"
              className={styles.collapse}
              items={collapseItems}
            />
          </div>
        </>
      ) : (
        <EventConfigPanel schema={schema} selectedId={selectedId} onSchemaChange={onSchemaChange} />
      )}
    </div>
  );
};
