import React, { useEffect } from 'react';
import { Bot, X, History, Sparkles } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import type { A2UISchema } from '../../../../types';
import { AIAssistant } from '../AIAssistant/AIAssistant';
import { useEditorStore } from '../../../store/editor-store';
import styles from './FloatingIsland.module.scss';

interface FloatingIslandProps {
  currentSchema?: A2UISchema | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
  isPreviewMode?: boolean;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  currentSchema = null,
  onSchemaUpdate,
  onError,
  isPreviewMode = false,
}) => {
  const isOpen = useEditorStore((state) => state.isFloatingIslandOpen);
  const setIsOpen = useEditorStore((state) => state.setFloatingIslandOpen);
  const toggleFloatingIsland = useEditorStore((state) => state.toggleFloatingIsland);
  const setHistoryDrawerOpen = useEditorStore((state) => state.setHistoryDrawerOpen);

  const dragControls = useDragControls();

  useEffect(() => {
    if (isPreviewMode && isOpen) {
      setIsOpen(false);
    }
  }, [isPreviewMode, isOpen, setIsOpen]);

  const handleHistoryClick = () => {
    setHistoryDrawerOpen(true);
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
            onSchemaUpdate={onSchemaUpdate}
            onError={onError}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
