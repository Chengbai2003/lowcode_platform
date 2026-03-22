import React, { memo } from 'react';
import type { ComponentPosition } from './useComponentPosition';
import styles from './PreviewPane.module.scss';

interface SelectionHighlightProps {
  position: ComponentPosition | null;
  componentName?: string;
  variant: 'selected' | 'hover' | 'ai-root' | 'ai-target';
}

/**
 * SelectionHighlight - 高亮框组件
 * 显示选中或悬停组件的边框
 */
export const SelectionHighlight: React.FC<SelectionHighlightProps> = memo(
  ({ position, componentName, variant }) => {
    if (!position) return null;

    const { top, left, width, height } = position;

    const highlightStyle: React.CSSProperties = {
      position: 'absolute',
      top,
      left,
      width,
      height,
      pointerEvents: 'none',
      zIndex: 1000,
      boxSizing: 'border-box',
    };

    switch (variant) {
      case 'selected':
        return (
          <div
            style={{
              ...highlightStyle,
              border: '2px solid #1890ff',
              borderRadius: '2px',
              backgroundColor: 'rgba(24, 144, 255, 0.05)',
            }}
            className={styles.selectionHighlight}
          >
            {componentName && <div className={styles.componentLabel}>{componentName}</div>}
          </div>
        );
      case 'ai-root':
        return (
          <div
            style={{
              ...highlightStyle,
              border: '2px dashed #f59e0b',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              boxShadow: '0 0 0 1px rgba(245, 158, 11, 0.14), 0 12px 28px rgba(245, 158, 11, 0.12)',
            }}
            className={styles.aiScopeRootHighlight}
          >
            {componentName && <div className={styles.aiRootLabel}>{componentName}</div>}
          </div>
        );
      case 'ai-target':
        return (
          <div
            style={{
              ...highlightStyle,
              border: '2px dashed #0891b2',
              borderRadius: '8px',
              backgroundColor: 'rgba(8, 145, 178, 0.08)',
              boxShadow:
                '0 0 0 1px rgba(8, 145, 178, 0.12), inset 0 0 0 1px rgba(8, 145, 178, 0.08)',
            }}
            className={styles.aiScopeTargetHighlight}
          />
        );
      case 'hover':
      default:
        return (
          <div
            style={{
              ...highlightStyle,
              border: '1px dashed #1890ff',
              borderRadius: '2px',
              backgroundColor: 'transparent',
            }}
            className={styles.hoverHighlight}
          />
        );
    }
  },
);

SelectionHighlight.displayName = 'SelectionHighlight';
