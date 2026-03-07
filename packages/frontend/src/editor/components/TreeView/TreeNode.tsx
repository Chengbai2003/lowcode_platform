import React from "react";
import type { TreeNodeData } from "./treeTypes";
import styles from "./ComponentTree.module.css";

/**
 * 组件类型图标映射
 */
const COMPONENT_ICONS: Record<string, string> = {
  Page: "📄",
  Container: "📦",
  Card: "🃏",
  Button: "🔘",
  Input: "✏️",
  TextArea: "📝",
  InputNumber: "🔢",
  Select: "📋",
  Checkbox: "☑️",
  Radio: "📻",
  Switch: "🔀",
  Slider: "🎚️",
  Form: "📋",
  FormItem: "📎",
  Table: "📊",
  List: "📜",
  Tabs: "📑",
  TabPane: "📖",
  Collapse: "📁",
  Modal: "🪟",
  Space: "␣",
  Divider: "➖",
  Row: "↔️",
  Col: "↕️",
  Layout: "🏗️",
  Header: "🔝",
  Content: "📄",
  Footer: "🔚",
  Typography: "🔤",
  Text: "📝",
  Title: "📌",
  Tag: "🏷️",
  Badge: "🛡️",
  Alert: "⚠️",
  Spin: "⏳",
};

/**
 * 获取组件图标
 */
function getComponentIcon(type: string): string {
  return COMPONENT_ICONS[type] || "🔲";
}

interface TreeNodeProps {
  node: TreeNodeData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNodeData) => void;
  expandedKeys: Set<string>;
  onToggleExpand: (id: string) => void;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  selectedId,
  onSelect,
  onContextMenu,
  expandedKeys,
  onToggleExpand,
}) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.id);
  const isSelected = selectedId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeNodeContent} ${isSelected ? styles.selected : ""}`}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 展开/折叠按钮 */}
        <span
          className={`${styles.expandIcon} ${hasChildren ? styles.visible : ""} ${isExpanded ? styles.expanded : ""}`}
          onClick={handleToggleExpand}
        >
          {hasChildren && (
            <svg
              viewBox="0 0 1024 1024"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="M764.6 453.8L533.3 685c-12.1 12.1-31.7 12.1-43.8 0L258.2 453.8c-12.1-12.1-12.1-31.7 0-43.8l5.5-5.5c12.1-12.1 31.7-12.1 43.8 0L512 609l204.5-204.5c12.1-12.1 31.7-12.1 43.8 0l5.5 5.5c12.1 12.1 12.1 31.7-0.2 43.8z" />
            </svg>
          )}
        </span>

        {/* 组件图标 */}
        <span className={styles.componentIcon}>
          {getComponentIcon(node.type)}
        </span>

        {/* 组件类型 */}
        <span className={styles.componentType}>{node.type}</span>

        {/* 组件 ID */}
        <span className={styles.componentId}>{node.id}</span>

        {/* 标签（如果有自定义显示名称） */}
        {node.label !== node.type && (
          <span className={styles.componentLabel} title={node.label}>
            {node.label}
          </span>
        )}
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div className={styles.treeNodeChildren}>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};
