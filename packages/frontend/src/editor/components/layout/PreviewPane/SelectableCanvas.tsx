import React, { useRef, useCallback, memo } from "react";
import { Renderer, LowcodeProvider } from "../../../../renderer";
import type {
  A2UISchema,
  ComponentRegistry,
  A2UIComponent,
} from "../../../../types";
import { useSelectionStore } from "../../../store/editor-store";
import { SelectionHighlight } from "./SelectionHighlight";
import { useComponentPosition } from "./useComponentPosition";
import { NoSchemaEmptyState } from "../../EmptyState";
import styles from "./PreviewPane.module.scss";

interface SelectableCanvasProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
}

/**
 * SelectableCanvas - 可选中的画布包装器
 * 为渲染的组件添加选中、悬停交互功能
 */
export const SelectableCanvas: React.FC<SelectableCanvasProps> = memo(
  ({ schema, allComponents, eventContext }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Selection store
    const selectedId = useSelectionStore((state) => state.selectedId);
    const hoverId = useSelectionStore((state) => state.hoverId);
    const selectComponent = useSelectionStore((state) => state.selectComponent);
    const setHover = useSelectionStore((state) => state.setHover);

    // Track component positions
    const { selectedPosition, hoverPosition } = useComponentPosition(
      containerRef,
      selectedId,
      hoverId,
    );

    // Get component name for label
    const getComponentName = useCallback(
      (id: string | null): string | undefined => {
        if (!id || !schema?.components) return undefined;
        const component = schema.components[id];
        return component?.type;
      },
      [schema],
    );

    // Handle component click
    const handleComponentClick = useCallback(
      (node: A2UIComponent) => {
        selectComponent(node.id);
      },
      [selectComponent],
    );

    // Handle container click (clear selection when clicking empty area)
    const handleContainerClick = useCallback(
      (e: React.MouseEvent) => {
        // Only clear if clicking directly on the container (not on a component)
        if (
          e.target === containerRef.current ||
          (e.target as HTMLElement).classList?.contains(styles.previewContent)
        ) {
          selectComponent(null);
        }
      },
      [selectComponent],
    );

    // Handle mouse leave from container
    const handleMouseLeave = useCallback(() => {
      setHover(null);
    }, [setHover]);

    // Handle mouse move for hover detection
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        // Find the closest component element
        const target = e.target as HTMLElement;
        const componentEl = target.closest("[data-component-id]");

        if (componentEl) {
          const id = componentEl.getAttribute("data-component-id");
          if (id && id !== hoverId) {
            setHover(id);
          }
        } else if (hoverId !== null) {
          setHover(null);
        }
      },
      [hoverId, setHover],
    );

    return (
      <div
        ref={containerRef}
        className={styles.selectableCanvas}
        onClick={handleContainerClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className={styles.previewContent}>
          {schema ? (
            <LowcodeProvider>
              <Renderer
                schema={schema}
                components={allComponents}
                eventContext={eventContext}
                onComponentClick={handleComponentClick}
              />
            </LowcodeProvider>
          ) : (
            <NoSchemaEmptyState />
          )}
        </div>

        {/* Hover highlight */}
        <SelectionHighlight position={hoverPosition} variant="hover" />

        {/* Selected highlight */}
        <SelectionHighlight
          position={selectedPosition}
          componentName={getComponentName(selectedId)}
          variant="selected"
        />
      </div>
    );
  },
);

SelectableCanvas.displayName = "SelectableCanvas";
