import { useCallback, useRef, useEffect } from "react";
import type { A2UISchema } from "../../types";
import { useHistoryStore } from "../store/history";
import {
  UpdateSchemaCommand,
  createUpdateSchemaCommand,
} from "../commands/schemaCommands";

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
  const {
    maxHistorySize = 50,
    enableMerge = true,
    mergeWindow = 500,
  } = options;

  // 引用上一次的 schema 用于撤销
  const lastSchemaRef = useRef<A2UISchema | null>(schema);
  // 用于合并连续操作的计时器
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 暂存的命令
  const pendingCommandRef = useRef<UpdateSchemaCommand | null>(null);

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

  // 组件卸载时清理计时器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      pendingCommandRef.current = null;
    };
  }, []);

  /**
   * 更新 Schema 并记录历史
   * 支持自动合并连续的快速操作
   */
  const updateSchema = useCallback(
    (newSchema: A2UISchema, description: string = "更新 Schema") => {
      if (!schema) return;

      const oldSchema = lastSchemaRef.current || schema;

      // 如果启用合并且有暂存的命令，检查是否在合并窗口内
      if (enableMerge && pendingCommandRef.current && mergeTimerRef.current) {
        // 清除之前的计时器
        clearTimeout(mergeTimerRef.current);

        // 创建新命令并执行
        const command = createUpdateSchemaCommand(
          oldSchema,
          newSchema,
          onChange,
          description,
        );
        pendingCommandRef.current = command;

        // 设置新的合并计时器
        mergeTimerRef.current = setTimeout(() => {
          if (pendingCommandRef.current) {
            executeCommand(pendingCommandRef.current);
            pendingCommandRef.current = null;
          }
        }, mergeWindow);
      } else {
        // 直接创建并执行命令
        const command = createUpdateSchemaCommand(
          oldSchema,
          newSchema,
          onChange,
          description,
        );

        if (enableMerge) {
          // 设置合并计时器
          pendingCommandRef.current = command;
          mergeTimerRef.current = setTimeout(() => {
            if (pendingCommandRef.current) {
              executeCommand(pendingCommandRef.current);
              pendingCommandRef.current = null;
            }
          }, mergeWindow);
        } else {
          executeCommand(command);
        }
      }

      // 更新引用
      lastSchemaRef.current = newSchema;
    },
    [schema, onChange, executeCommand, enableMerge, mergeWindow],
  );

  /**
   * 强制立即更新（跳过合并）
   */
  const forceUpdateSchema = useCallback(
    (newSchema: A2UISchema, description: string = "更新 Schema") => {
      if (!schema) return;

      const oldSchema = lastSchemaRef.current || schema;

      // 清除合并计时器
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }

      // 如果有暂存的命令，先执行它
      if (pendingCommandRef.current) {
        executeCommand(pendingCommandRef.current);
        pendingCommandRef.current = null;
      }

      // 创建并执行新命令
      const command = createUpdateSchemaCommand(
        oldSchema,
        newSchema,
        onChange,
        description,
      );
      executeCommand(command);

      // 更新引用
      lastSchemaRef.current = newSchema;
    },
    [schema, onChange, executeCommand],
  );

  /**
   * 撤销操作
   */
  const handleUndo = useCallback(() => {
    const command = undo();
    if (command instanceof UpdateSchemaCommand) {
      // 更新引用为撤销后的状态
      lastSchemaRef.current = schema;
    }
    return command;
  }, [undo, schema]);

  /**
   * 重做操作
   */
  const handleRedo = useCallback(() => {
    const command = redo();
    if (command instanceof UpdateSchemaCommand) {
      // 更新引用为重做后的状态
      lastSchemaRef.current = schema;
    }
    return command;
  }, [redo, schema]);

  /**
   * 清空历史记录
   */
  const handleClear = useCallback(() => {
    // 清除合并计时器和暂存命令
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    pendingCommandRef.current = null;

    clear();
  }, [clear]);

  return {
    /** 更新 Schema（支持合并） */
    updateSchema,
    /** 强制立即更新 Schema */
    forceUpdateSchema,
    /** 撤销 */
    undo: handleUndo,
    /** 重做 */
    redo: handleRedo,
    /** 是否可以撤销 */
    canUndo: canUndo(),
    /** 是否可以重做 */
    canRedo: canRedo(),
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
      const command = createUpdateSchemaCommand(
        oldSchema,
        newSchema,
        setSchema,
        description,
      );
      executeCommand(command);
    },
    [setSchema, executeCommand],
  );

  return {
    executeSchemaUpdate,
    executeCommand,
  };
}
