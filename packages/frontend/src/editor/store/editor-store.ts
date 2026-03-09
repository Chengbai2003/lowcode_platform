import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AISessionMeta } from '../../types';

// ============================================
// Selection Store - 组件选择状态
// ============================================

interface SelectionState {
  selectedId: string | null;
  hoverId: string | null;
  selectedIds: string[];
  selectComponent: (id: string | null) => void;
  setHover: (id: string | null) => void;
  clearSelection: () => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
}

export const useSelectionStore = create<SelectionState>()(
  devtools(
    (set) => ({
      selectedId: null,
      hoverId: null,
      selectedIds: [],

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
  toggleHistoryDrawer: () => void;
  setHistoryDrawerOpen: (open: boolean) => void;
  toggleFloatingIsland: () => void;
  setFloatingIslandOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      currentSessionId: null,
      sessions: [],
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

export const useFloatingIslandState = () => useEditorStore((state) => state.isFloatingIslandOpen);

export const useHistoryDrawerState = () => useEditorStore((state) => state.isHistoryDrawerOpen);

export const useEditorLoading = () => useEditorStore((state) => state.isLoading);

export const useEditorError = () => useEditorStore((state) => state.error);
