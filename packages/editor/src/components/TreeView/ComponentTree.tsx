import React, { useState, useCallback, useMemo } from "react";
import type {
  ComponentTreeProps,
  TreeNodeData,
  ContextMenuPosition,
} from "./treeTypes";
import type { ContextMenuAction } from "./treeTypes";
import { TreeNode } from "./TreeNode";
import {
  ContextMenu,
  MoveTargetSelector,
  handleContextMenuAction,
} from "./ContextMenu";
import { schemaToTree, moveComponentTo } from "./schemaToTree";
import styles from "./ComponentTree.module.css";

/**
 * 组件树主组件
 * 展示 Schema 的树形结构，支持选择、展开/折叠、右键菜单操作
 */
export const ComponentTree: React.FC<ComponentTreeProps> = ({
  schema,
  selectedId,
  onSelect,
  onSchemaChange,
}) => {
  // 展开的节点
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: ContextMenuPosition;
    node: TreeNodeData | null;
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    node: null,
  });

  // 移动目标选择器状态
  const [moveTargetVisible, setMoveTargetVisible] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<TreeNodeData | null>(
    null,
  );

  // 将 Schema 转换为树形数据
  const treeData = useMemo(
    () => schemaToTree(schema, expandedKeys),
    [schema, expandedKeys],
  );

  // 切换节点展开状态
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // 处理右键菜单
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNodeData) => {
      e.preventDefault();
      setContextMenu({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        node,
      });
    },
    [],
  );

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  // 处理右键菜单操作
  const handleAction = useCallback(
    (action: string, node: TreeNodeData) => {
      if (!schema) return;

      handleContextMenuAction(
        action as ContextMenuAction,
        node,
        schema,
        onSchemaChange,
        () => {
          setMoveSourceNode(node);
          setMoveTargetVisible(true);
        },
      );
    },
    [schema, onSchemaChange],
  );

  // 处理移动到目标
  const handleMoveToTarget = useCallback(
    (targetParentId: string) => {
      if (!schema || !moveSourceNode) return;

      const newSchema = moveComponentTo(
        schema,
        moveSourceNode.id,
        targetParentId,
      );
      if (newSchema) {
        onSchemaChange(newSchema);
      }
      setMoveTargetVisible(false);
      setMoveSourceNode(null);
    },
    [schema, moveSourceNode, onSchemaChange],
  );

  // 默认展开所有节点
  React.useEffect(() => {
    if (schema && schema.components) {
      const allIds = new Set(Object.keys(schema.components));
      setExpandedKeys(allIds);
    }
  }, [schema]); // schema 变化时重置展开状态

  return (
    <div className={styles.componentTree}>
      <div className={styles.treeHeader}>
        <span>组件树</span>
        <span style={{ fontSize: "10px", color: "#666" }}>
          {schema ? Object.keys(schema.components).length : 0} 个组件
        </span>
      </div>

      <div className={styles.treeContent}>
        {treeData.length === 0 ? (
          <div className={styles.emptyState}>暂无组件</div>
        ) : (
          treeData.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
              onContextMenu={handleContextMenu}
              expandedKeys={expandedKeys}
              onToggleExpand={handleToggleExpand}
            />
          ))
        )}
      </div>

      {/* 右键菜单 */}
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        node={contextMenu.node}
        schema={schema}
        onClose={closeContextMenu}
        onAction={handleAction}
      />

      {/* 移动目标选择器 */}
      <MoveTargetSelector
        visible={moveTargetVisible}
        schema={schema}
        sourceId={moveSourceNode?.id || ""}
        onConfirm={handleMoveToTarget}
        onCancel={() => {
          setMoveTargetVisible(false);
          setMoveSourceNode(null);
        }}
      />
    </div>
  );
};
