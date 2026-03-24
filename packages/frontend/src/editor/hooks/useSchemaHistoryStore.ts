import { useCallback, useRef, useEffect } from 'react';
import type { A2UISchema } from '../../types';
import { useHistoryStore } from '../store/history';
import { UpdateSchemaCommand, createUpdateSchemaCommand } from '../commands/schemaCommands';

/**
 * SchemaHistoryOptions - Schema 历史记录配置选项
 */
export interface SchemaHistoryOptions {
  /** 最大历史记录数 */
  maxHistorySize?: number;
  /** 是否启用自动合并连续相同操作 */
  enableMerge?: boolean;
  /** 合并时间窗口（毫秒） */
  mergeWindow?: number;
}

/**
 * useSchemaHistoryStore - 集成 History Store 的 Schema 管理钩子
 * 提供基于命令模式的 Schema 历史记录管理
 */
export function useSchemaHistoryStore(
  schema: A2UISchema | null,
  onChange: (schema: A2UISchema) => void,
  options: SchemaHistoryOptions = {},
) {
  const { maxHistorySize = 50, enableMerge = true, mergeWindow = 500 } = options;

  // 当前已应用到 UI 的 schema，避免在同一渲染周期内读到旧闭包值。
  const currentSchemaRef = useRef<A2UISchema | null>(schema);
  // 用于合并连续操作的计时器
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 暂存的合并命令
  const pendingCommandRef = useRef<UpdateSchemaCommand | null>(null);
  // 记录连续输入开始前的 schema，供撤销回退使用
  const pendingStartSchemaRef = useRef<A2UISchema | null>(null);

  const {
    executeCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    getUndoStackSize,
    getRedoStackSize,
  } = useHistoryStore();

  useEffect(() => {
    currentSchemaRef.current = schema;
  }, [schema]);

  // 组件卸载时清理计时器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      pendingCommandRef.current = null;
      pendingStartSchemaRef.current = null;
    };
  }, []);

  const clearPendingMerge = useCallback(() => {
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    pendingCommandRef.current = null;
    pendingStartSchemaRef.current = null;
  }, []);

  const flushPendingMerge = useCallback(() => {
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }

    if (pendingCommandRef.current) {
      executeCommand(pendingCommandRef.current);
      pendingCommandRef.current = null;
      pendingStartSchemaRef.current = null;
    }
  }, [executeCommand]);

  /**
   * 更新 Schema 并记录历史
   * 支持自动合并连续的快速操作
   */
  const updateSchema = useCallback(
    (newSchema: A2UISchema, description: string = '更新 Schema') => {
      const currentSchema = currentSchemaRef.current;
      if (!currentSchema) return;

      if (!enableMerge) {
        const command = createUpdateSchemaCommand(currentSchema, newSchema, onChange, description);
        executeCommand(command);
        currentSchemaRef.current = newSchema;
        return;
      }

      onChange(newSchema);
      currentSchemaRef.current = newSchema;

      const burstStartSchema = pendingStartSchemaRef.current || currentSchema;
      pendingStartSchemaRef.current = burstStartSchema;

      pendingCommandRef.current = createUpdateSchemaCommand(
        burstStartSchema,
        newSchema,
        onChange,
        description,
        { applyOnExecute: false },
      );

      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
      }

      mergeTimerRef.current = setTimeout(() => {
        flushPendingMerge();
      }, mergeWindow);
    },
    [onChange, executeCommand, enableMerge, mergeWindow, flushPendingMerge],
  );

  /**
   * 强制立即更新（跳过合并）
   */
  const forceUpdateSchema = useCallback(
    (newSchema: A2UISchema, description: string = '更新 Schema') => {
      const currentSchema = currentSchemaRef.current;
      if (!currentSchema) return;

      flushPendingMerge();

      // 创建并执行新命令
      const command = createUpdateSchemaCommand(
        currentSchemaRef.current || currentSchema,
        newSchema,
        onChange,
        description,
      );
      executeCommand(command);
      currentSchemaRef.current = newSchema;
    },
    [onChange, executeCommand, flushPendingMerge],
  );

  const executeSchemaCommand = useCallback(
    (command: UpdateSchemaCommand) => {
      flushPendingMerge();
      executeCommand(command);
      currentSchemaRef.current = command.getNewSchema();
    },
    [executeCommand, flushPendingMerge],
  );

  /**
   * 撤销操作
   */
  const handleUndo = useCallback(() => {
    flushPendingMerge();
    const command = undo();
    if (command instanceof UpdateSchemaCommand) {
      currentSchemaRef.current = command.getOldSchema();
    }
    return command;
  }, [undo, flushPendingMerge]);

  /**
   * 重做操作
   */
  const handleRedo = useCallback(() => {
    flushPendingMerge();
    const command = redo();
    if (command instanceof UpdateSchemaCommand) {
      currentSchemaRef.current = command.getNewSchema();
    }
    return command;
  }, [redo, flushPendingMerge]);

  /**
   * 清空历史记录
   */
  const handleClear = useCallback(() => {
    clearPendingMerge();
    clear();
  }, [clear, clearPendingMerge]);

  return {
    /** 更新 Schema（支持合并） */
    updateSchema,
    /** 强制立即更新 Schema */
    forceUpdateSchema,
    /** 执行自定义 Schema 命令 */
    executeSchemaCommand,
    /** 撤销 */
    undo: handleUndo,
    /** 重做 */
    redo: handleRedo,
    /** 是否可以撤销 */
    canUndo: pendingCommandRef.current !== null || canUndo(),
    /** 是否可以重做 */
    canRedo: pendingCommandRef.current === null && canRedo(),
    /** 清空历史 */
    clear: handleClear,
    /** 撤销栈大小 */
    undoStackSize: getUndoStackSize(),
    /** 重做栈大小 */
    redoStackSize: getRedoStackSize(),
    /** 历史记录总数 */
    historySize: getUndoStackSize(),
    /** 最大历史记录数 */
    maxHistorySize,
  };
}

/**
 * useSchemaCommands - 提供创建 Schema 命令的便捷方法
 */
export function useSchemaCommands(
  _getSchema: () => A2UISchema | null,
  setSchema: (schema: A2UISchema) => void,
) {
  const { executeCommand } = useHistoryStore();

  /**
   * 执行 Schema 更新命令
   */
  const executeSchemaUpdate = useCallback(
    (oldSchema: A2UISchema, newSchema: A2UISchema, description?: string) => {
      const command = createUpdateSchemaCommand(oldSchema, newSchema, setSchema, description);
      executeCommand(command);
    },
    [setSchema, executeCommand],
  );

  return {
    executeSchemaUpdate,
    executeCommand,
  };
}
