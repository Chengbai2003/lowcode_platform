import React, { useEffect, useRef } from 'react';
import { Modal, Tree, message } from 'antd';
import type { TreeDataNode } from 'antd';
import { Copy, ArrowUp, ArrowDown, FolderOpen, Trash2 } from 'lucide-react';
import type { ContextMenuProps, ContextMenuAction, TreeNodeData } from './treeTypes';
import type { A2UISchema } from '../../../types';
import { deleteComponent, copyComponent, moveComponent, canMove } from './schemaToTree';
import styles from './ComponentTree.module.scss';

/**
 * 右键菜单组件
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  visible,
  position,
  node,
  schema,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible || !node || !schema) return null;

  // 检查移动能力
  const moveStatus = canMove(schema, node.id);

  // 检查是否是根节点
  const isRoot = schema.rootId === node.id;

  const menuItems = [
    {
      key: 'copy' as ContextMenuAction,
      label: '复制',
      icon: <Copy size={14} />,
      disabled: isRoot,
    },
    { type: 'divider' as const },
    {
      key: 'moveUp' as ContextMenuAction,
      label: '上移',
      icon: <ArrowUp size={14} />,
      disabled: !moveStatus.up || isRoot,
    },
    {
      key: 'moveDown' as ContextMenuAction,
      label: '下移',
      icon: <ArrowDown size={14} />,
      disabled: !moveStatus.down || isRoot,
    },
    {
      key: 'moveTo' as ContextMenuAction,
      label: '移动到...',
      icon: <FolderOpen size={14} />,
      disabled: isRoot,
    },
    { type: 'divider' as const },
    {
      key: 'delete' as ContextMenuAction,
      label: '删除',
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: isRoot,
    },
  ];

  const handleMenuClick = (action: ContextMenuAction) => {
    onAction(action, node);
    onClose();
  };

  // 调整菜单位置，确保不超出屏幕
  const adjustedStyle: React.CSSProperties = {
    left: Math.min(position.x, window.innerWidth - 160),
    top: Math.min(position.y, window.innerHeight - 200),
  };

  return (
    <div ref={menuRef} className={styles.contextMenu} style={adjustedStyle}>
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return <div key={`divider-${index}`} className={styles.menuDivider} />;
        }

        return (
          <div
            key={item.key}
            className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''} ${item.danger ? styles.danger : ''}`}
            onClick={() => !item.disabled && handleMenuClick(item.key)}
          >
            <span className={styles.menuIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 移动目标选择器
 */
export const MoveTargetSelector: React.FC<{
  visible: boolean;
  schema: A2UISchema | null;
  sourceId: string;
  onConfirm: (targetParentId: string) => void;
  onCancel: () => void;
}> = ({ visible, schema, sourceId, onConfirm, onCancel }) => {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  // 构建树形数据用于选择
  const buildTreeData = (schema: A2UISchema): TreeDataNode[] => {
    if (!schema || !schema.rootId || !schema.components) return [];

    const components = schema.components;

    function buildNode(id: string): TreeDataNode | null {
      const component = components[id];
      if (!component) return null;

      // 不能移动到自己和自己的子节点下
      if (id === sourceId) return null;

      const childrenIds = component.childrenIds || [];
      const children: TreeDataNode[] = childrenIds
        .map((childId: string) => buildNode(childId))
        .filter((node: TreeDataNode | null): node is TreeDataNode => node !== null);

      return {
        key: id,
        title: `${component.type} (${id})`,
        children,
      };
    }

    const root = buildNode(schema.rootId);
    return root ? [root] : [];
  };

  const treeData = schema ? buildTreeData(schema) : [];

  const handleConfirm = () => {
    if (selectedKey) {
      onConfirm(selectedKey);
    }
  };

  return (
    <Modal
      title="选择目标容器"
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      okButtonProps={{ disabled: !selectedKey }}
      width={400}
    >
      <p className={styles.selectorHint}>选择要将组件移动到的目标容器：</p>
      <div className={styles.treeSelector}>
        <Tree
          treeData={treeData}
          selectedKeys={selectedKey ? [selectedKey] : []}
          onSelect={(keys) => setSelectedKey(keys[0] as string | null)}
          defaultExpandAll
        />
      </div>
    </Modal>
  );
};

/**
 * 处理右键菜单操作
 */
export function handleContextMenuAction(
  action: ContextMenuAction,
  node: TreeNodeData,
  schema: A2UISchema,
  onSchemaChange: (schema: A2UISchema) => void,
  onShowMoveTarget: () => void,
): void {
  switch (action) {
    case 'delete': {
      const newSchema = deleteComponent(schema, node.id);
      onSchemaChange(newSchema);
      message.success(`已删除 ${node.type}`);
      break;
    }

    case 'copy': {
      const newSchema = copyComponent(schema, node.id);
      if (newSchema) {
        onSchemaChange(newSchema);
        message.success(`已复制 ${node.type}`);
      }
      break;
    }

    case 'moveUp': {
      const newSchema = moveComponent(schema, node.id, 'up');
      if (newSchema) {
        onSchemaChange(newSchema);
      }
      break;
    }

    case 'moveDown': {
      const newSchema = moveComponent(schema, node.id, 'down');
      if (newSchema) {
        onSchemaChange(newSchema);
      }
      break;
    }

    case 'moveTo': {
      onShowMoveTarget();
      break;
    }
  }
}
