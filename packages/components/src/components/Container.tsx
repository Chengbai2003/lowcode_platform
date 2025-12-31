import React from 'react';

/**
 * 容器组件
 * 带有默认样式的包装 div，用于布局容器
 */
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** 容器宽度预设 */
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full' | number;
  /** 容器内边距 */
  padding?: string | number;
  /** 是否居中 */
  center?: boolean;
}

const widthMap: Record<string, string> = {
  xs: '100%',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  full: '100%',
};

export const Container: React.FC<ContainerProps> = ({
  children,
  width = 'lg',
  padding = '16px',
  center = true,
  style,
  ...props
}) => {
  const containerStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    width: typeof width === 'number' ? `${width}px` : widthMap[width] || width,
    padding,
    marginLeft: center ? 'auto' : undefined,
    marginRight: center ? 'auto' : undefined,
    ...style,
  };

  return (
    <div style={containerStyle} {...props}>
      {children}
    </div>
  );
};

Container.displayName = 'Container';

export default Container;
