import React, { useMemo, useCallback } from "react";
import { Collapse } from "antd";
import type { A2UISchema, PropertyMeta } from "../../../types";
import { getComponentMeta } from "../../../components";
import { StringEditor } from "./editors/StringEditor";
import { NumberEditor } from "./editors/NumberEditor";
import { BooleanEditor } from "./editors/BooleanEditor";
import { SelectEditor } from "./editors/SelectEditor";
import { ColorEditor } from "./editors/ColorEditor";
import { NoSelectionEmptyState } from "../EmptyState";
import styles from "./PropertyPanel.module.css";

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
    const { meta } = componentConfig;
    const groups: Record<string, PropertyMeta[]> = {
      基础: [],
      样式: [],
      高级: [],
    };
    meta.properties.forEach((prop) => {
      const group = prop.group || "基础";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(prop);
    });
    // 移除空分组
    return Object.fromEntries(
      Object.entries(groups).filter(([, props]) => props.length > 0),
    );
  }, [componentConfig]);

  // 处理属性变更
  const handlePropertyChange = useCallback(
    (key: string, value: unknown) => {
      if (!schema || !selectedId) return;
      const component = schema.components[selectedId];
      if (!component) return;

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...component,
            props: {
              ...component.props,
              [key]: value,
            },
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
        case "string":
          return <StringEditor {...commonProps} />;
        case "number":
          return <NumberEditor {...commonProps} />;
        case "boolean":
          return <BooleanEditor {...commonProps} />;
        case "select":
          return <SelectEditor {...commonProps} options={prop.options || []} />;
        case "color":
          return <ColorEditor {...commonProps} />;
        case "json":
          // JSON 编辑器暂用字符串编辑器
          return <StringEditor {...commonProps} multiline />;
        case "expression":
          // 表达式编辑器暂用字符串编辑器
          return <StringEditor {...commonProps} placeholder="输入表达式..." />;
        case "slot":
          // 插槽编辑器暂不支持
          return null;
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
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{meta.displayName}</span>
        <span className={styles.componentType}>{component.type}</span>
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
    </div>
  );
};
