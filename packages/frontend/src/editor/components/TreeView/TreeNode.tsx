import React from "react";
import {
  ChevronDown,
  LayoutTemplate,
  Square,
  Type,
  TextCursorInput,
  RectangleHorizontal,
} from "lucide-react";
import type { TreeNodeData } from "./treeTypes";
import styles from "./ComponentTree.module.scss";

/**
 * 组件类型到图标的映射
 */
const getComponentIcon = (type: string) => {
  const iconProps = { size: 16, className: styles.icon };

  switch (type) {
    case "Page":
      return <LayoutTemplate {...iconProps} />;
    case "Container":
    case "Card":
      return <Square {...iconProps} />;
    case "Input":
    case "TextArea":
    case "InputNumber":
      return <TextCursorInput {...iconProps} />;
    case "Button":
      return <RectangleHorizontal {...iconProps} />;
    case "Typography":
    case "Text":
    case "Title":
      return <Type {...iconProps} />;
    default:
      return <Square {...iconProps} />;
  }
};

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
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 展开/折叠图标 */}
        <span
          className={`${styles.expandIcon} ${hasChildren ? styles.visible : ""} ${isExpanded ? styles.expanded : ""}`}
          onClick={handleToggleExpand}
        >
          {hasChildren && <ChevronDown size={16} />}
        </span>

        {/* 组件图标 */}
        <span className={styles.componentIcon}>
          {getComponentIcon(node.type)}
        </span>

        {/* 组件名称 */}
        <span className={styles.componentName}>{node.label || node.type}</span>
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
