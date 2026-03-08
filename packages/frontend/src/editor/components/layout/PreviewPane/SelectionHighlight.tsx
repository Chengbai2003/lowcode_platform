import React, { memo } from 'react';
import type { ComponentPosition } from './useComponentPosition';
import styles from './PreviewPane.module.scss';

interface SelectionHighlightProps {
  position: ComponentPosition | null;
  componentName?: string;
  variant: 'selected' | 'hover';
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

    if (variant === 'selected') {
      // 选中状态：蓝色实线边框 + 名称标签
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
    }

    // 悬停状态：蓝色虚线边框
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
  },
);

SelectionHighlight.displayName = 'SelectionHighlight';
