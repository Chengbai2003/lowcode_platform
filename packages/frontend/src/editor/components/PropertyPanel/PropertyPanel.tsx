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
import { NoSelectionEmptyState } from '../EmptyState';
import { EventConfigPanel } from './EventConfigPanel';
import styles from './PropertyPanel.module.scss';

interface PropertyPanelProps {
  schema: A2UISchema | null;
  selectedId: string | null;
  onSchemaChange: (schema: A2UISchema) => void;
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
    (key: string, value: unknown) => {
      if (!schema || !selectedId) return;
      const component = schema.components[selectedId];
      if (!component) return;
      const prevProps = component.props || {};
      const nextProps = { ...prevProps };

      if (value === undefined) {
        delete nextProps[key];
      } else {
        nextProps[key] = value;
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
      const value = component.props?.[prop.key] ?? prop.defaultValue;

      const commonProps = {
        key: prop.key,
        label: prop.label,
        value,
        onChange: (val: unknown) => handlePropertyChange(prop.key, val),
        description: prop.description,
      };

      switch (prop.editor) {
        case 'string':
          return <StringEditor {...commonProps} />;
        case 'number':
          return <NumberEditor {...commonProps} />;
        case 'boolean':
          return <BooleanEditor {...commonProps} />;
        case 'select':
          return <SelectEditor {...commonProps} options={prop.options || []} />;
        case 'color':
          return <ColorEditor {...commonProps} />;
        case 'json':
          return <JsonEditor {...commonProps} />;
        case 'expression':
          // 表达式编辑器暂用字符串编辑器
          return <StringEditor {...commonProps} placeholder="输入表达式..." />;
        case 'slot':
          return (
            <StringEditor
              {...commonProps}
              multiline
              placeholder="插槽内容请通过组件树编辑"
            />
          );
        default:
          return null;
      }
    },
    [componentConfig, handlePropertyChange],
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
            >
              {Object.entries(groupedProperties).map(([groupName, properties]) => (
                <Collapse.Panel
                  key={groupName}
                  header={<span className={styles.groupHeader}>{groupName}</span>}
                  className={styles.collapsePanel}
                >
                  <div className={styles.propertiesList}>
                    {properties.map((prop) => renderEditor(prop))}
                  </div>
                </Collapse.Panel>
              ))}
            </Collapse>
          </div>
        </>
      ) : (
        <EventConfigPanel schema={schema} selectedId={selectedId} onSchemaChange={onSchemaChange} />
      )}
    </div>
  );
};
