import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import React from 'react';

// ============================================
// Command Interface - 命令模式核心接口
// ============================================

/**
 * Command Pattern 接口
 * 每个命令必须实现 execute、undo、redo 方法
 */
export interface Command {
  /** 执行命令 */
  execute(): void;
  /** 撤销命令 */
  undo(): void;
  /** 重做命令 */
  redo(): void;
  /** 命令描述，用于 UI 显示 */
  description: string;
  /** 命令时间戳 */
  timestamp: number;
  /** 命令唯一标识 */
  id: string;
}

/**
 * 创建命令的基础选项
 */
export interface CommandOptions {
  description: string;
  id?: string;
}

/**
 * 命令工厂函数类型
 */
export type CommandFactory<T = unknown> = (params: T, options: CommandOptions) => Command;

// ============================================
// History Store - 历史记录管理
// ============================================

interface HistoryState {
  /** 撤销栈 */
  undoStack: Command[];
  /** 重做栈 */
  redoStack: Command[];
  /** 最大历史记录数 */
  maxHistorySize: number;
  /** 当前是否正在执行命令（防止重复执行） */
  isExecuting: boolean;
  /** 当前页面 ID，用于隔离 per-page 历史 */
  currentPageId: string | null;
  /** 单调递增代次，page 切换或 clear 时递增，用于 async 响应过期校验 */
  generation: number;
}

interface HistoryActions {
  /** 执行命令并压入历史栈 */
  executeCommand: (command: Command) => void;
  /** 撤销最近一个命令 */
  undo: () => Command | null;
  /** 重做最近撤销的命令 */
  redo: () => Command | null;
  /** 是否可以撤销 */
  canUndo: () => boolean;
  /** 是否可以重做 */
  canRedo: () => boolean;
  /** 清空历史记录 */
  clear: () => void;
  /** 获取撤销栈大小 */
  getUndoStackSize: () => number;
  /** 获取重做栈大小 */
  getRedoStackSize: () => number;
  /** 获取最近 N 条撤销命令描述 */
  getUndoHistory: (count?: number) => string[];
  /** 获取最近 N 条重做命令描述 */
  getRedoHistory: (count?: number) => string[];
  /** 设置当前页面上下文，pageId 变化时自动清空并递增 generation */
  setCurrentPageId: (pageId: string | null) => void;
  /** setPageContext 别名，兼容不同调用方 */
  setPageContext: (pageId: string | null) => void;
  /** clearForPage 别名 */
  clearForPage: (pageId: string | null) => void;
  /** 获取当前页面 ID */
  getCurrentPageId: () => string | null;
  /** 获取当前 generation */
  getGeneration: () => number;
}

type HistoryStore = HistoryState & HistoryActions;

// ============================================
// History Store 实现
// ============================================

/**
 * 生成唯一命令 ID
 */
const generateCommandId = (): string => {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * 创建命令的基础选项
 */
export const createCommandOptions = (
  description: string,
  id?: string,
): CommandOptions & { timestamp: number; id: string } => ({
  description,
  id: id || generateCommandId(),
  timestamp: Date.now(),
});

/**
 * History Store
 * 使用 Zustand 管理命令历史记录
 */
export const useHistoryStore = create<HistoryStore>()(
  devtools(
    (set, get) => ({
      undoStack: [],
      redoStack: [],
      maxHistorySize: 50,
      isExecuting: false,
      currentPageId: null,
      generation: 0,

      executeCommand: (command: Command) => {
        const state = get();
        if (state.isExecuting) return;

        set({ isExecuting: true });

        try {
          command.execute();

          set((state) => {
            const newUndoStack = [...state.undoStack, command];

            // 限制历史记录大小
            if (newUndoStack.length > state.maxHistorySize) {
              newUndoStack.shift();
            }

            return {
              undoStack: newUndoStack,
              redoStack: [], // 执行新命令时清空重做栈
              isExecuting: false,
            };
          });
        } catch (error) {
          set({ isExecuting: false });
          console.error('Command execution failed:', error);
          throw error;
        }
      },

      undo: () => {
        const state = get();
        if (state.undoStack.length === 0 || state.isExecuting) return null;

        const command = state.undoStack[state.undoStack.length - 1];

        set({ isExecuting: true });

        try {
          command.undo();

          set((state) => {
            const newUndoStack = state.undoStack.slice(0, -1);
            const newRedoStack = [...state.redoStack, command];

            return {
              undoStack: newUndoStack,
              redoStack: newRedoStack,
              isExecuting: false,
            };
          });

          return command;
        } catch (error) {
          set({ isExecuting: false });
          console.error('Command undo failed:', error);
          throw error;
        }
      },

      redo: () => {
        const state = get();
        if (state.redoStack.length === 0 || state.isExecuting) return null;

        const command = state.redoStack[state.redoStack.length - 1];

        set({ isExecuting: true });

        try {
          command.redo();

          set((state) => {
            const newRedoStack = state.redoStack.slice(0, -1);
            const newUndoStack = [...state.undoStack, command];

            return {
              undoStack: newUndoStack,
              redoStack: newRedoStack,
              isExecuting: false,
            };
          });

          return command;
        } catch (error) {
          set({ isExecuting: false });
          console.error('Command redo failed:', error);
          throw error;
        }
      },

      canUndo: () => {
        const state = get();
        return state.undoStack.length > 0 && !state.isExecuting;
      },

      canRedo: () => {
        const state = get();
        return state.redoStack.length > 0 && !state.isExecuting;
      },

      clear: () => {
        set((state) => ({
          undoStack: [],
          redoStack: [],
          generation: state.generation + 1,
        }));
      },

      setCurrentPageId: (pageId) => {
        const state = get();
        if (state.currentPageId === pageId) return;
        set({
          currentPageId: pageId,
          undoStack: [],
          redoStack: [],
          generation: state.generation + 1,
        });
      },

      setPageContext: (pageId) => {
        // alias to setCurrentPageId for compatibility
        get().setCurrentPageId(pageId);
      },

      clearForPage: (pageId) => {
        get().setCurrentPageId(pageId);
      },

      getCurrentPageId: () => {
        return get().currentPageId;
      },

      getGeneration: () => {
        return get().generation;
      },

      getUndoStackSize: () => {
        return get().undoStack.length;
      },

      getRedoStackSize: () => {
        return get().redoStack.length;
      },

      getUndoHistory: (count?: number) => {
        const state = get();
        const history = state.undoStack.map((cmd) => cmd.description).reverse();
        return count ? history.slice(0, count) : history;
      },

      getRedoHistory: (count?: number) => {
        const state = get();
        const history = state.redoStack.map((cmd) => cmd.description).reverse();
        return count ? history.slice(0, count) : history;
      },
    }),
    { name: 'history-store' },
  ),
);

// ============================================
// 选择器 Hooks（性能优化）
// ============================================

/**
 * 获取可撤销状态
 * 使用浅比较避免不必要的重渲染
 */
export const useCanUndo = () =>
  useHistoryStore((state) => state.undoStack.length > 0 && !state.isExecuting);

/**
 * 获取可重做状态
 * 使用浅比较避免不必要的重渲染
 */
export const useCanRedo = () =>
  useHistoryStore((state) => state.redoStack.length > 0 && !state.isExecuting);

/**
 * 获取撤销栈大小
 */
export const useUndoStackSize = () => useHistoryStore((state) => state.undoStack.length);

/**
 * 获取重做栈大小
 */
export const useRedoStackSize = () => useHistoryStore((state) => state.redoStack.length);

/**
 * 获取执行状态
 */
export const useIsExecuting = () => useHistoryStore((state) => state.isExecuting);

/**
 * 获取撤销历史（memoized）
 */
export const useUndoHistory = (count?: number) => {
  const undoStack = useHistoryStore((state) => state.undoStack);
  return React.useMemo(() => {
    const history = undoStack.map((cmd) => cmd.description).reverse();
    return count ? history.slice(0, count) : history;
  }, [undoStack, count]);
};

/**
 * 获取重做历史（memoized）
 */
export const useRedoHistory = (count?: number) => {
  const redoStack = useHistoryStore((state) => state.redoStack);
  return React.useMemo(() => {
    const history = redoStack.map((cmd) => cmd.description).reverse();
    return count ? history.slice(0, count) : history;
  }, [redoStack, count]);
};
