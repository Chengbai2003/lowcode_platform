// Store exports
export {
  useSelectionStore,
  useEditorStore,
  useSelectedId,
  useHoverId,
  useSelectedIds,
  useCurrentSessionId,
  useSessions,
  useAIScopeRootId,
  useAIScopeTargetIds,
  useAIScopeSourceMessageId,
  useFloatingIslandState,
  useHistoryDrawerState,
  useEditorLoading,
  useEditorError,
} from './editor-store';

// History store exports
export {
  useHistoryStore,
  useCanUndo,
  useCanRedo,
  useUndoStackSize,
  useRedoStackSize,
  useIsExecuting,
  useUndoHistory,
  useRedoHistory,
  createCommandOptions,
} from './history';
export type { Command, CommandOptions, CommandFactory } from './history';
