import React from 'react';
import { Button as AntButton } from 'antd';

/**
 * 按钮组件
 */
export interface ButtonProps extends React.ComponentProps<typeof AntButton> {
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  type = 'default',
  size = 'middle',
  ...props
}) => {
  return <AntButton type={type} size={size} {...props} />;
};

Button.displayName = 'Button';

export default Button;
