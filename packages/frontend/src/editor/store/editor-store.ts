import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AISessionMeta } from '../../types';
import { useHistoryStore } from './history';

const genDocumentSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
    return (crypto as Crypto).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

// ============================================
// Selection Store - 组件选择状态
// ============================================

interface SelectionState {
  selectedId: string | null;
  hoverId: string | null;
  selectedIds: string[];
  currentPageId: string | null;
  generation: number;
  documentSessionId: string;
  selectComponent: (id: string | null) => void;
  setHover: (id: string | null) => void;
  clearSelection: () => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  setCurrentPageId: (pageId: string | null) => void;
  setPageContext: (pageId: string | null) => void;
  clearForPage: (pageId: string | null) => void;
  resetForDocument: (pageId: string | null) => void;
  resetForDocumentAndGetGeneration: (pageId: string | null) => number;
  getCurrentPageId: () => string | null;
  getGeneration: () => number;
  getDocumentSessionId: () => string;
}

export const useSelectionStore = create<SelectionState>()(
  devtools(
    (set, get) => ({
      selectedId: null,
      hoverId: null,
      selectedIds: [],
      currentPageId: null,
      generation: 0,
      documentSessionId: genDocumentSessionId(),

      selectComponent: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),

      setHover: (id) => set({ hoverId: id }),

      clearSelection: () => set({ selectedId: null, hoverId: null, selectedIds: [] }),

      addToSelection: (id) =>
        set((state) => {
          if (state.selectedIds.includes(id)) return state;
          const newIds = [...state.selectedIds, id];
          return {
            selectedIds: newIds,
            selectedId: newIds.length === 1 ? newIds[0] : null,
          };
        }),

      removeFromSelection: (id) =>
        set((state) => {
          const newIds = state.selectedIds.filter((i) => i !== id);
          return {
            selectedIds: newIds,
            selectedId: newIds.length === 1 ? newIds[0] : state.selectedId,
          };
        }),

      setCurrentPageId: (pageId) => {
        const state = get();
        if (state.currentPageId === pageId) return;
        set({
          currentPageId: pageId,
          selectedId: null,
          hoverId: null,
          selectedIds: [],
          generation: state.generation + 1,
        });
      },

      setPageContext: (pageId) => {
        get().setCurrentPageId(pageId);
      },

      clearForPage: (pageId) => {
        get().setCurrentPageId(pageId);
      },

      resetForDocument: (pageId) => {
        // ponytail ultra: force per-document reset, bump generation even if same id
        const state = get();
        const newSessionId = genDocumentSessionId();
        set({
          currentPageId: pageId,
          selectedId: null,
          hoverId: null,
          selectedIds: [],
          generation: state.generation + 1,
          documentSessionId: newSessionId,
        });
      },

      resetForDocumentAndGetGeneration: (pageId) => {
        const state = get();
        const newSessionId = genDocumentSessionId();
        const newGen = state.generation + 1;
        set({
          currentPageId: pageId,
          selectedId: null,
          hoverId: null,
          selectedIds: [],
          generation: newGen,
          documentSessionId: newSessionId,
        });
        return newGen;
      },

      getCurrentPageId: () => get().currentPageId,

      getGeneration: () => get().generation,

      getDocumentSessionId: () => get().documentSessionId,
    }),
    { name: 'selection-store' },
  ),
);

// ============================================
// Editor Store - 编辑器状态
// ============================================

interface EditorState {
  // AI Session 状态
  currentSessionId: string | null;
  sessions: AISessionMeta[];
  aiScopeRootId: string | null;
  aiScopeTargetIds: string[];
  aiScopeSourceMessageId: string | null;
  // Page 隔离
  currentPageId: string | null;
  generation: number;
  documentSessionId: string;
  // UI 状态
  isHistoryDrawerOpen: boolean;
  isFloatingIslandOpen: boolean;
  // 加载状态
  isLoading: boolean;
  error: string | null;
  // Actions
  setCurrentSessionId: (id: string | null) => void;
  setSessions: (sessions: AISessionMeta[]) => void;
  addSession: (session: AISessionMeta) => void;
  updateSessionMeta: (session: Partial<AISessionMeta> & { id: string }) => void;
  removeSession: (sessionId: string) => void;
  setAIScopeHighlight: (input: {
    rootId: string;
    targetIds: string[];
    sourceMessageId: string | null;
  }) => void;
  clearAIScopeHighlight: () => void;
  toggleHistoryDrawer: () => void;
  setHistoryDrawerOpen: (open: boolean) => void;
  toggleFloatingIsland: () => void;
  setFloatingIslandOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentPageId: (pageId: string | null) => void;
  setPageContext: (pageId: string | null) => void;
  clearForPage: (pageId: string | null) => void;
  resetForDocument: (pageId: string | null) => void;
  resetForDocumentAndGetGeneration: (pageId: string | null) => number;
  getCurrentPageId: () => string | null;
  getGeneration: () => number;
  getDocumentSessionId: () => string;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      currentSessionId: null,
      sessions: [],
      aiScopeRootId: null,
      aiScopeTargetIds: [],
      aiScopeSourceMessageId: null,
      currentPageId: null,
      generation: 0,
      documentSessionId: genDocumentSessionId(),
      isHistoryDrawerOpen: false,
      isFloatingIslandOpen: false,
      isLoading: false,
      error: null,

      setCurrentSessionId: (id) => set({ currentSessionId: id }),

      setSessions: (sessions) => set({ sessions }),

      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
        })),

      updateSessionMeta: (updated) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
        })),

      removeSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        })),

      setAIScopeHighlight: ({ rootId, targetIds, sourceMessageId }) =>
        set({
          aiScopeRootId: rootId,
          aiScopeTargetIds: [...new Set(targetIds)],
          aiScopeSourceMessageId: sourceMessageId,
        }),

      clearAIScopeHighlight: () =>
        set({
          aiScopeRootId: null,
          aiScopeTargetIds: [],
          aiScopeSourceMessageId: null,
        }),

      toggleHistoryDrawer: () =>
        set((state) => ({ isHistoryDrawerOpen: !state.isHistoryDrawerOpen })),

      setHistoryDrawerOpen: (open) => set({ isHistoryDrawerOpen: open }),

      toggleFloatingIsland: () =>
        set((state) => ({
          isFloatingIslandOpen: !state.isFloatingIslandOpen,
        })),

      setFloatingIslandOpen: (open) => set({ isFloatingIslandOpen: open }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      setCurrentPageId: (pageId) => {
        const state = get();
        if (state.currentPageId === pageId) return;
        set({ currentPageId: pageId, generation: state.generation + 1 });
        // 同步清理 history 与 selection，实现 per-page 隔离
        useHistoryStore.getState().setCurrentPageId(pageId);
        useSelectionStore.getState().setCurrentPageId(pageId);
      },

      setPageContext: (pageId) => {
        get().setCurrentPageId(pageId);
      },

      clearForPage: (pageId) => {
        get().setCurrentPageId(pageId);
      },

      resetForDocument: (pageId) => {
        const state = get();
        const newSessionId = genDocumentSessionId();
        // force bump even if same id to isolate document singletons
        set({
          currentPageId: pageId,
          generation: state.generation + 1,
          documentSessionId: newSessionId,
          aiScopeRootId: null,
          aiScopeTargetIds: [],
          aiScopeSourceMessageId: null,
        });
        useHistoryStore.getState().resetForDocument(pageId);
        useSelectionStore.getState().resetForDocument(pageId);
      },

      resetForDocumentAndGetGeneration: (pageId) => {
        const state = get();
        const newSessionId = genDocumentSessionId();
        const newGen = state.generation + 1;
        set({
          currentPageId: pageId,
          generation: newGen,
          documentSessionId: newSessionId,
          aiScopeRootId: null,
          aiScopeTargetIds: [],
          aiScopeSourceMessageId: null,
        });
        useHistoryStore.getState().resetForDocument(pageId);
        useSelectionStore.getState().resetForDocument(pageId);
        return newGen;
      },

      getCurrentPageId: () => get().currentPageId,

      getGeneration: () => get().generation,

      getDocumentSessionId: () => get().documentSessionId,
    }),
    { name: 'editor-store' },
  ),
);

// ============================================
// 选择器 Hooks（性能优化）
// ============================================

export const useSelectedId = () => useSelectionStore((state) => state.selectedId);

export const useHoverId = () => useSelectionStore((state) => state.hoverId);

export const useSelectedIds = () => useSelectionStore((state) => state.selectedIds);

export const useCurrentSessionId = () => useEditorStore((state) => state.currentSessionId);

export const useSessions = () => useEditorStore((state) => state.sessions);

export const useAIScopeRootId = () => useEditorStore((state) => state.aiScopeRootId);

export const useAIScopeTargetIds = () => useEditorStore((state) => state.aiScopeTargetIds);

export const useAIScopeSourceMessageId = () =>
  useEditorStore((state) => state.aiScopeSourceMessageId);

export const useFloatingIslandState = () => useEditorStore((state) => state.isFloatingIslandOpen);

export const useHistoryDrawerState = () => useEditorStore((state) => state.isHistoryDrawerOpen);

export const useEditorLoading = () => useEditorStore((state) => state.isLoading);

export const useEditorError = () => useEditorStore((state) => state.error);
