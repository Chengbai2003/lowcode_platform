import type { A2UISchema } from "../../../types";

/**
 * 树节点数据结构（用于 TreeView 渲染）
 */
export interface TreeNodeData {
  id: string;
  type: string;
  label: string; // 显示名称，如 "Button" 或 props.children
  children: TreeNodeData[];
  depth: number;
}

/**
 * 右键菜单操作类型
 */
export type ContextMenuAction =
  | "delete"
  | "copy"
  | "moveUp"
  | "moveDown"
  | "moveTo";

/**
 * 右键菜单项
 */
export interface ContextMenuItem {
  key: ContextMenuAction;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * 右键菜单位置
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * 组件树 Props
 */
export interface ComponentTreeProps {
  schema: A2UISchema | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSchemaChange: (schema: A2UISchema) => void;
}

/**
 * 树节点 Props
 */
export interface TreeNodeProps {
  node: TreeNodeData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNodeData) => void;
  expandedKeys: Set<string>;
  onToggleExpand: (id: string) => void;
}

/**
 * 右键菜单 Props
 */
export interface ContextMenuProps {
  visible: boolean;
  position: ContextMenuPosition;
  node: TreeNodeData | null;
  schema: A2UISchema | null;
  onClose: () => void;
  onAction: (action: ContextMenuAction, node: TreeNodeData) => void;
}

/**
 * 移动目标选择器 Props
 */
export interface MoveTargetSelectorProps {
  visible: boolean;
  schema: A2UISchema;
  sourceId: string;
  onConfirm: (targetParentId: string) => void;
  onCancel: () => void;
}
