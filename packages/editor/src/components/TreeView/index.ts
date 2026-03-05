// 组件树模块
export { ComponentTree } from "./ComponentTree";
export { TreeNode } from "./TreeNode";
export {
  ContextMenu,
  MoveTargetSelector,
  handleContextMenuAction,
} from "./ContextMenu";

// 工具函数
export {
  schemaToTree,
  deleteComponent,
  copyComponent,
  moveComponent,
  moveComponentTo,
  findParentId,
  canMove,
  getComponentIndex,
} from "./schemaToTree";

// 类型导出
export type {
  TreeNodeData,
  ContextMenuAction,
  ContextMenuItem,
  ContextMenuPosition,
  ComponentTreeProps,
  TreeNodeProps,
  ContextMenuProps,
  MoveTargetSelectorProps,
} from "./treeTypes";
