import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelectionStore, useEditorStore } from "../editor-store";

describe("useSelectionStore", () => {
  beforeEach(() => {
    // Reset store state
    useSelectionStore.setState({
      selectedId: null,
      hoverId: null,
      selectedIds: [],
    });
  });

  it("should have initial state", () => {
    const { result } = renderHook(() => useSelectionStore());

    expect(result.current.selectedId).toBeNull();
    expect(result.current.hoverId).toBeNull();
    expect(result.current.selectedIds).toEqual([]);
  });

  it("should select component", () => {
    const { result } = renderHook(() => useSelectionStore());

    act(() => {
      result.current.selectComponent("button-1");
    });

    expect(result.current.selectedId).toBe("button-1");
    expect(result.current.selectedIds).toEqual(["button-1"]);
  });

  it("should clear selection", () => {
    const { result } = renderHook(() => useSelectionStore());

    act(() => {
      result.current.selectComponent("button-1");
    });

    expect(result.current.selectedId).toBe("button-1");

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.selectedIds).toEqual([]);
  });

  it("should set hover", () => {
    const { result } = renderHook(() => useSelectionStore());

    act(() => {
      result.current.setHover("container-1");
    });

    expect(result.current.hoverId).toBe("container-1");
  });

  it("should add to selection", () => {
    const { result } = renderHook(() => useSelectionStore());

    act(() => {
      result.current.selectComponent("button-1");
      result.current.addToSelection("button-2");
    });

    expect(result.current.selectedIds).toEqual(["button-1", "button-2"]);
  });

  it("should remove from selection", () => {
    const { result } = renderHook(() => useSelectionStore());

    act(() => {
      result.current.selectComponent("button-1");
      result.current.addToSelection("button-2");
      result.current.removeFromSelection("button-1");
    });

    expect(result.current.selectedIds).toEqual(["button-2"]);
  });
});

describe("useEditorStore", () => {
  beforeEach(() => {
    // Reset store state
    useEditorStore.setState({
      currentSessionId: null,
      sessions: [],
      isHistoryDrawerOpen: false,
      isFloatingIslandOpen: false,
      isLoading: false,
      error: null,
    });
  });

  it("should have initial state", () => {
    const { result } = renderHook(() => useEditorStore());

    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.sessions).toEqual([]);
    expect(result.current.isHistoryDrawerOpen).toBe(false);
    expect(result.current.isFloatingIslandOpen).toBe(false);
  });

  it("should toggle floating island", () => {
    const { result } = renderHook(() => useEditorStore());

    expect(result.current.isFloatingIslandOpen).toBe(false);

    act(() => {
      result.current.toggleFloatingIsland();
    });

    expect(result.current.isFloatingIslandOpen).toBe(true);

    act(() => {
      result.current.toggleFloatingIsland();
    });

    expect(result.current.isFloatingIslandOpen).toBe(false);
  });

  it("should set floating island open", () => {
    const { result } = renderHook(() => useEditorStore());

    act(() => {
      result.current.setFloatingIslandOpen(true);
    });

    expect(result.current.isFloatingIslandOpen).toBe(true);
  });

  it("should toggle history drawer", () => {
    const { result } = renderHook(() => useEditorStore());

    expect(result.current.isHistoryDrawerOpen).toBe(false);

    act(() => {
      result.current.toggleHistoryDrawer();
    });

    expect(result.current.isHistoryDrawerOpen).toBe(true);
  });

  it("should set loading state", () => {
    const { result } = renderHook(() => useEditorStore());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("should set error state", () => {
    const { result } = renderHook(() => useEditorStore());

    act(() => {
      result.current.setError("Test error");
    });

    expect(result.current.error).toBe("Test error");
  });

  it("should add session", () => {
    const { result } = renderHook(() => useEditorStore());

    const session = {
      id: "session-1",
      title: "Test Session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      lastMessageContent: "",
      lastMessageTimestamp: 0,
    };

    act(() => {
      result.current.addSession(session);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].title).toBe("Test Session");
  });

  it("should remove session", () => {
    const { result } = renderHook(() => useEditorStore());

    const session = {
      id: "session-1",
      title: "Test Session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      lastMessageContent: "",
      lastMessageTimestamp: 0,
    };

    act(() => {
      result.current.addSession(session);
    });

    expect(result.current.sessions).toHaveLength(1);

    act(() => {
      result.current.removeSession("session-1");
    });

    expect(result.current.sessions).toHaveLength(0);
  });
});
