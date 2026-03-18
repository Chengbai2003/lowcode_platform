import React, { useEffect, useRef, useState } from 'react';
import { Bot, X, History, Sparkles } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import type { A2UISchema } from '../../../../types';
import { AIAssistant } from '../AIAssistant/AIAssistant';
import { useEditorStore } from '../../../store/editor-store';
import styles from './FloatingIsland.module.scss';

interface FloatingIslandProps {
  currentSchema?: A2UISchema | null;
  pageId?: string;
  pageVersion?: number | null;
  selectedId?: string | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
  isPreviewMode?: boolean;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  currentSchema = null,
  pageId,
  pageVersion,
  selectedId,
  onSchemaUpdate,
  onError,
  isPreviewMode = false,
}) => {
  const isOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const setIsOpen = useEditorStore((state) => state.setFloatingIslandOpen);
  const toggleFloatingIsland = useEditorStore((state) => state.toggleFloatingIsland);
  const setHistoryDrawerOpen = useEditorStore((state) => state.setHistoryDrawerOpen);

  const dragControls = useDragControls();
  const resizeStartRef = useRef<{
    width: number;
    height: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);
  const [panelSize, setPanelSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 550, height: 620 };
    }

    try {
      const raw = window.localStorage.getItem('lowcode-floating-island-size');
      if (!raw) {
        return { width: 550, height: 620 };
      }

      const parsed = JSON.parse(raw) as Partial<{ width: number; height: number }>;
      return {
        width: typeof parsed.width === 'number' ? parsed.width : 550,
        height: typeof parsed.height === 'number' ? parsed.height : 620,
      };
    } catch {
      return { width: 550, height: 620 };
    }
  });

  useEffect(() => {
    if (isPreviewMode && isOpen) {
      setIsOpen(false);
    }
  }, [isPreviewMode, isOpen, setIsOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('lowcode-floating-island-size', JSON.stringify(panelSize));
  }, [panelSize]);

  const handleHistoryClick = () => {
    setHistoryDrawerOpen(true);
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    resizeStartRef.current = {
      width: panelSize.width,
      height: panelSize.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) {
        return;
      }

      const nextWidth = start.width + (start.pointerX - moveEvent.clientX);
      const nextHeight = start.height + (start.pointerY - moveEvent.clientY);
      const maxWidth = Math.max(420, window.innerWidth - 48);
      const maxHeight = Math.max(520, window.innerHeight - 48);

      setPanelSize({
        width: Math.min(Math.max(nextWidth, 480), maxWidth),
        height: Math.min(Math.max(nextHeight, 520), maxHeight),
      });
    };

    const handlePointerUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (isPreviewMode) {
    return null;
  }

  if (!isOpen) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className={styles.floatingButtonWrapper}
        >
          <button className={styles.floatingButton} onClick={toggleFloatingIsland}>
            <Sparkles size={28} />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className={styles.floatingIsland}
        style={{
          width: `min(${panelSize.width}px, calc(100vw - 48px))`,
          height: `min(${panelSize.height}px, calc(100vh - 48px))`,
        }}
      >
        {/* 头部 */}
        <div className={styles.header} onPointerDown={(e) => dragControls.start(e)}>
          <div className={styles.headerLeft}>
            <Bot size={18} />
            <span className={styles.headerTitle}>A2UI 助手</span>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.iconButton}
              onClick={handleHistoryClick}
              aria-label="历史记录"
            >
              <History size={16} />
            </button>
            <button
              className={styles.iconButton}
              onClick={() => setIsOpen(false)}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.content}>
          <AIAssistant
            currentSchema={currentSchema}
            pageId={pageId}
            pageVersion={pageVersion}
            selectedId={selectedId}
            onSchemaUpdate={onSchemaUpdate}
            onError={onError}
          />
        </div>

        <div
          className={styles.resizeHandle}
          onPointerDown={handleResizePointerDown}
          aria-label="调整助手面板大小"
          role="separator"
        />
      </motion.div>
    </AnimatePresence>
  );
};
