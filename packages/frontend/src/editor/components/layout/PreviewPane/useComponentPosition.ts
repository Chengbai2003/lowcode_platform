import { useCallback, useEffect, useRef, useState } from 'react';

export interface ComponentPosition {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Hook to track component positions in the canvas
 * Uses ResizeObserver and MutationObserver for dynamic updates
 */
export function useComponentPosition(
  containerRef: React.RefObject<HTMLElement | null>,
  selectedId: string | null,
  hoverId: string | null,
): {
  selectedPosition: ComponentPosition | null;
  hoverPosition: ComponentPosition | null;
  refreshPositions: () => void;
} {
  const [positions, setPositions] = useState<Map<string, ComponentPosition>>(new Map());
  const positionsRef = useRef(positions);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep positionsRef in sync
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Calculate position for a single element
  const calculatePosition = useCallback(
    (element: HTMLElement, container: HTMLElement): ComponentPosition | null => {
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Skip if element is not visible
      if (elementRect.width === 0 || elementRect.height === 0) {
        return null;
      }

      return {
        id: element.getAttribute('data-component-id') || '',
        top: elementRect.top - containerRect.top,
        left: elementRect.left - containerRect.left,
        width: elementRect.width,
        height: elementRect.height,
      };
    },
    [],
  );

  // Update all component positions
  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;

    // Cancel any pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use RAF to batch updates
    rafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const components = container.querySelectorAll('[data-component-id]');
      const newPositions = new Map<string, ComponentPosition>();

      components.forEach((el) => {
        const position = calculatePosition(el as HTMLElement, container);
        if (position && position.id) {
          newPositions.set(position.id, position);
        }
      });

      setPositions(newPositions);
    });
  }, [containerRef, calculatePosition]);

  // Setup observers
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Setup ResizeObserver
    resizeObserverRef.current = new ResizeObserver(() => {
      updatePositions();
    });

    // Observe all components and the container
    const observeElements = () => {
      if (!containerRef.current || !resizeObserverRef.current) return;

      resizeObserverRef.current.disconnect();
      resizeObserverRef.current.observe(container);

      const components = container.querySelectorAll('[data-component-id]');
      components.forEach((el) => {
        resizeObserverRef.current?.observe(el);
      });
    };

    // Setup MutationObserver to detect DOM changes
    mutationObserverRef.current = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'attributes') {
          shouldUpdate = true;
          break;
        }
      }

      if (shouldUpdate) {
        observeElements();
        updatePositions();
      }
    });

    mutationObserverRef.current.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-component-id'],
    });

    // Initial update
    observeElements();
    updatePositions();

    // Listen for scroll and resize events
    const handleScroll = () => updatePositions();
    const handleResize = () => updatePositions();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      resizeObserverRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [containerRef, updatePositions]);

  // Get selected and hover positions
  const selectedPosition = selectedId ? positions.get(selectedId) || null : null;
  const hoverPosition = hoverId && hoverId !== selectedId ? positions.get(hoverId) || null : null;

  return {
    selectedPosition,
    hoverPosition,
    refreshPositions: updatePositions,
  };
}
