import React, { useRef, useCallback, memo } from 'react';
import { Renderer, LowcodeProvider } from '../../../../renderer';
import type { A2UISchema, ComponentRegistry, A2UIComponent } from '../../../../types';
import { useSelectionStore } from '../../../store/editor-store';
import { SelectionHighlight } from './SelectionHighlight';
import { useComponentPosition } from './useComponentPosition';
import { NoSchemaEmptyState } from '../../EmptyState';
import styles from './PreviewPane.module.scss';

const COMPONENT_ID_CLASS_PREFIX = 'lowcode-component-id-';

interface SelectableCanvasProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  isPreviewMode?: boolean;
}

/**
 * SelectableCanvas - 可选中的画布包装器
 * 为渲染的组件添加选中、悬停交互功能
 */
export const SelectableCanvas: React.FC<SelectableCanvasProps> = memo(
  ({ schema, allComponents, eventContext, isPreviewMode = false }) => {
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

    // Resolve clicked/hovered component id by walking up DOM tree
    const resolveComponentIdFromTarget = useCallback((target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null;

      let current: Element | null = target;
      while (current && current !== containerRef.current) {
        const dataId = current.getAttribute('data-component-id');
        if (dataId) return dataId;

        const markerClass = Array.from(current.classList).find((cls) =>
          cls.startsWith(COMPONENT_ID_CLASS_PREFIX),
        );
        if (markerClass) {
          return markerClass.slice(COMPONENT_ID_CLASS_PREFIX.length) || null;
        }

        current = current.parentElement;
      }

      return null;
    }, []);

    // Handle component click
    const handleComponentClick = useCallback(
      (node: A2UIComponent) => {
        if (!isPreviewMode) {
          selectComponent(node.id);
        }
      },
      [selectComponent, isPreviewMode],
    );

    // Handle container click in capture phase so selection is based on real click target
    const handleContainerClickCapture = useCallback(
      (e: React.MouseEvent) => {
        if (isPreviewMode) return;
        const clickedId = resolveComponentIdFromTarget(e.target);

        if (clickedId) {
          if (clickedId !== selectedId) {
            selectComponent(clickedId);
          }
        } else {
          selectComponent(null);
        }
      },
      [isPreviewMode, resolveComponentIdFromTarget, selectedId, selectComponent],
    );

    // Handle mouse leave from container
    const handleMouseLeave = useCallback(() => {
      setHover(null);
    }, [setHover]);

    // Handle mouse move for hover detection
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        const id = resolveComponentIdFromTarget(e.target);

        if (id) {
          if (id !== hoverId) setHover(id);
        } else if (hoverId !== null) {
          setHover(null);
        }
      },
      [hoverId, resolveComponentIdFromTarget, setHover],
    );

    return (
      <div
        ref={containerRef}
        className={styles.selectableCanvas}
        onClickCapture={handleContainerClickCapture}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className={`${styles.previewContent} ${isPreviewMode ? styles.previewMode : ''}`}>
          {schema ? (
            <LowcodeProvider>
              <Renderer
                schema={schema}
                components={allComponents}
                eventContext={eventContext}
                onComponentClick={isPreviewMode ? undefined : handleComponentClick}
              />
            </LowcodeProvider>
          ) : (
            <NoSchemaEmptyState />
          )}
        </div>

        {/* Hover highlight - hidden in preview mode */}
        {!isPreviewMode && <SelectionHighlight position={hoverPosition} variant="hover" />}

        {/* Selected highlight - hidden in preview mode */}
        {!isPreviewMode && (
          <SelectionHighlight
            position={selectedPosition}
            componentName={getComponentName(selectedId)}
            variant="selected"
          />
        )}
      </div>
    );
  },
);

SelectableCanvas.displayName = 'SelectableCanvas';
