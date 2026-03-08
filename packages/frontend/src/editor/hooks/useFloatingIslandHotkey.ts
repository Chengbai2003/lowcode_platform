import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../store';

export interface HotkeyConfig {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

/**
 * 浮动岛快捷键 Hook
 * 处理 CMD+K/Ctrl+K 打开浮动岛，ESC 关闭，Alt+H 打开历史抽屉
 */
export const useFloatingIslandHotkey = () => {
  const isFloatingIslandOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const toggleFloatingIsland = useEditorStore((state) => state.toggleFloatingIsland);
  const setFloatingIslandOpen = useEditorStore((state) => state.setFloatingIslandOpen);
  const toggleHistoryDrawer = useEditorStore((state) => state.toggleHistoryDrawer);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 检查是否在输入框中
      const target = e.target as HTMLElement;
      const isInputting =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // CMD+K / Ctrl+K - 打开/关闭浮动岛
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleFloatingIsland();
        return;
      }

      // ESC - 关闭浮动岛
      if (e.key === 'Escape' && isFloatingIslandOpen) {
        e.preventDefault();
        setFloatingIslandOpen(false);
        return;
      }

      // Alt+H - 打开/关闭历史抽屉
      if (e.altKey && e.key === 'h' && !isInputting) {
        e.preventDefault();
        toggleHistoryDrawer();
        return;
      }
    },
    [isFloatingIslandOpen, toggleFloatingIsland, setFloatingIslandOpen, toggleHistoryDrawer],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    isFloatingIslandOpen,
    toggleFloatingIsland,
    setFloatingIslandOpen,
  };
};

/**
 * 通用快捷键 Hook
 * 用于注册自定义快捷键
 */
export const useHotkeys = (hotkeys: HotkeyConfig[]) => {
  // 使用 JSON.stringify 来稳定依赖
  const hotkeysKey = JSON.stringify(
    hotkeys.map((h) => ({
      key: h.key,
      metaKey: h.metaKey,
      ctrlKey: h.ctrlKey,
      altKey: h.altKey,
      shiftKey: h.shiftKey,
    })),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const config of hotkeys) {
        const keyMatch = e.key.toLowerCase() === config.key.toLowerCase();
        const metaMatch = config.metaKey ? e.metaKey : !e.metaKey;
        const ctrlMatch = config.ctrlKey ? e.ctrlKey : !e.ctrlKey;
        const altMatch = config.altKey ? e.altKey : !e.altKey;
        const shiftMatch = config.shiftKey ? e.shiftKey : !e.shiftKey;

        if (keyMatch && metaMatch && ctrlMatch && altMatch && shiftMatch) {
          e.preventDefault();
          config.handler(e);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkeysKey]);
};
