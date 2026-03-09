import React, { useCallback } from 'react';
import { Button, Tooltip, Dropdown } from 'antd';
import { UndoOutlined, RedoOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useHistoryStore, useCanUndo, useCanRedo } from '../../store/history';
import styles from './UndoRedoButtons.module.scss';

interface UndoRedoButtonsProps {
  /** 自定义撤销按钮类名 */
  undoClassName?: string;
  /** 自定义重做按钮类名 */
  redoClassName?: string;
  /** 是否显示历史记录下拉菜单 */
  showHistoryMenu?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义撤销回调 */
  onUndo?: () => void;
  /** 自定义重做回调 */
  onRedo?: () => void;
}

/**
 * UndoRedoButtons - 撤销/重做按钮组件
 * 支持键盘快捷键提示和历史记录下拉菜单
 */
export const UndoRedoButtons: React.FC<UndoRedoButtonsProps> = ({
  undoClassName,
  redoClassName,
  showHistoryMenu = false,
  disabled = false,
  onUndo,
  onRedo,
}) => {
  const undo = useHistoryStore((state) => state.undo);
  const redo = useHistoryStore((state) => state.redo);
  const getUndoHistory = useHistoryStore((state) => state.getUndoHistory);
  const getRedoHistory = useHistoryStore((state) => state.getRedoHistory);

  // 使用优化后的选择器
  const canUndoState = useCanUndo();
  const canRedoState = useCanRedo();

  const isUndoDisabled = disabled || !canUndoState;
  const isRedoDisabled = disabled || !canRedoState;

  // 处理撤销
  const handleUndo = useCallback(() => {
    if (!isUndoDisabled) {
      try {
        undo();
        onUndo?.();
      } catch (error) {
        console.error('Undo failed:', error);
      }
    }
  }, [isUndoDisabled, undo, onUndo]);

  // 处理重做
  const handleRedo = useCallback(() => {
    if (!isRedoDisabled) {
      try {
        redo();
        onRedo?.();
      } catch (error) {
        console.error('Redo failed:', error);
      }
    }
  }, [isRedoDisabled, redo, onRedo]);

  // 批量撤销（带错误处理）
  const performMultipleUndo = useCallback(
    (count: number) => {
      let successCount = 0;
      for (let i = 0; i < count; i++) {
        try {
          const result = undo();
          if (result) {
            successCount++;
          } else {
            break;
          }
        } catch (error) {
          console.error(`Undo step ${i + 1} failed:`, error);
          break;
        }
      }
      if (successCount > 0) {
        onUndo?.();
      }
    },
    [undo, onUndo],
  );

  // 批量重做（带错误处理）
  const performMultipleRedo = useCallback(
    (count: number) => {
      let successCount = 0;
      for (let i = 0; i < count; i++) {
        try {
          const result = redo();
          if (result) {
            successCount++;
          } else {
            break;
          }
        } catch (error) {
          console.error(`Redo step ${i + 1} failed:`, error);
          break;
        }
      }
      if (successCount > 0) {
        onRedo?.();
      }
    },
    [redo, onRedo],
  );

  // 获取撤销历史菜单项
  const getUndoMenuItems = useCallback((): MenuProps['items'] => {
    if (!showHistoryMenu) return [];

    const history = getUndoHistory(10);
    if (history.length === 0) return [];

    return history.map((desc, index) => ({
      key: `undo-${index}`,
      label: desc,
      onClick: () => performMultipleUndo(index + 1),
    }));
  }, [showHistoryMenu, getUndoHistory, performMultipleUndo]);

  // 获取重做历史菜单项
  const getRedoMenuItems = useCallback((): MenuProps['items'] => {
    if (!showHistoryMenu) return [];

    const history = getRedoHistory(10);
    if (history.length === 0) return [];

    return history.map((desc, index) => ({
      key: `redo-${index}`,
      label: desc,
      onClick: () => performMultipleRedo(index + 1),
    }));
  }, [showHistoryMenu, getRedoHistory, performMultipleRedo]);

  const undoButton = (
    <Tooltip title="撤销 (Ctrl+Z)" placement="bottom">
      <Button
        type="text"
        icon={<UndoOutlined />}
        onClick={handleUndo}
        disabled={isUndoDisabled}
        className={`${styles.button} ${isUndoDisabled ? styles.disabled : ''} ${undoClassName || ''}`}
        aria-label="撤销"
      />
    </Tooltip>
  );

  const redoButton = (
    <Tooltip title="重做 (Ctrl+Shift+Z / Ctrl+Y)" placement="bottom">
      <Button
        type="text"
        icon={<RedoOutlined />}
        onClick={handleRedo}
        disabled={isRedoDisabled}
        className={`${styles.button} ${isRedoDisabled ? styles.disabled : ''} ${redoClassName || ''}`}
        aria-label="重做"
      />
    </Tooltip>
  );

  return (
    <div className={styles.container}>
      {showHistoryMenu ? (
        <>
          <Dropdown menu={{ items: getUndoMenuItems() }} trigger={['contextMenu']}>
            {undoButton}
          </Dropdown>
          <Dropdown menu={{ items: getRedoMenuItems() }} trigger={['contextMenu']}>
            {redoButton}
          </Dropdown>
        </>
      ) : (
        <>
          {undoButton}
          {redoButton}
        </>
      )}
    </div>
  );
};

/**
 * useUndoRedo - 自定义 Hook 用于处理键盘快捷键
 * 建议在编辑器根组件使用
 */
export const useUndoRedoShortcuts = (
  options: {
    enabled?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
  } = {},
) => {
  const { enabled = true, onUndo, onRedo } = options;
  const undo = useHistoryStore((state) => state.undo);
  const redo = useHistoryStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 使用更现代的平台检测方法
      const isMac =
        typeof navigator !== 'undefined' &&
        (navigator.platform.toUpperCase().includes('MAC') ||
          navigator.userAgent.toUpperCase().includes('MAC'));
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 'z') {
        e.preventDefault();

        if (e.shiftKey) {
          // Ctrl/Cmd + Shift + Z = Redo
          if (canRedo) {
            try {
              redo();
              onRedo?.();
            } catch (error) {
              console.error('Redo shortcut failed:', error);
            }
          }
        } else {
          // Ctrl/Cmd + Z = Undo
          if (canUndo) {
            try {
              undo();
              onUndo?.();
            } catch (error) {
              console.error('Undo shortcut failed:', error);
            }
          }
        }
      } else if (modKey && e.key === 'y') {
        // Ctrl/Cmd + Y = Redo (Windows style)
        e.preventDefault();
        if (canRedo) {
          try {
            redo();
            onRedo?.();
          } catch (error) {
            console.error('Redo shortcut failed:', error);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, undo, redo, canUndo, canRedo, onUndo, onRedo]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
  };
};

export default UndoRedoButtons;
