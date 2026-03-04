import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAIContext } from "../useAIContext";
import { useSelectionStore } from "../../store/editor-store";
import type { A2UISchema } from "@lowcode-platform/types";

describe("useAIContext", () => {
  beforeEach(() => {
    // Reset selection store
    useSelectionStore.setState({
      selectedId: null,
      hoverId: null,
      selectedIds: [],
    });
  });

  it("should return empty context when no schema", () => {
    const { result } = renderHook(() => useAIContext({ currentSchema: null }));

    expect(result.current.selectedComponentIds).toEqual([]);
    expect(result.current.selectedComponentProps).toBeNull();
    expect(result.current.selectedComponentType).toBeNull();
    expect(result.current.formattedContext).toBe("");
  });

  it("should return empty context when no component selected", () => {
    const schema: A2UISchema = {
      rootId: "root",
      components: {
        root: {
          id: "root",
          type: "Page",
          props: {},
          childrenIds: ["button-1"],
        },
        "button-1": {
          id: "button-1",
          type: "Button",
          props: { text: "Click Me" },
        },
      },
    };

    const { result } = renderHook(() =>
      useAIContext({ currentSchema: schema }),
    );

    expect(result.current.selectedComponentIds).toEqual([]);
    expect(result.current.selectedComponentProps).toBeNull();
  });

  it("should return context when component is selected", () => {
    const schema: A2UISchema = {
      rootId: "root",
      components: {
        root: {
          id: "root",
          type: "Page",
          props: {},
          childrenIds: ["button-1"],
        },
        "button-1": {
          id: "button-1",
          type: "Button",
          props: { text: "Click Me", variant: "primary" },
        },
      },
    };

    // First select a component using the store
    useSelectionStore.getState().selectComponent("button-1");

    const { result } = renderHook(() =>
      useAIContext({ currentSchema: schema }),
    );

    expect(result.current.selectedComponentIds).toEqual(["button-1"]);
    expect(result.current.selectedComponentType).toBe("Button");
    expect(result.current.selectedComponentProps).toEqual({
      text: "Click Me",
      variant: "primary",
    });
    expect(result.current.formattedContext).toContain("Button");
    expect(result.current.formattedContext).toContain("button-1");
  });
});
