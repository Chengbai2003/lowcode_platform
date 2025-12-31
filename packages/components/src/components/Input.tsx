import React from 'react';
import { Input as AntInput } from 'antd';

/**
 * 输入框组件
 */
export interface InputProps extends React.ComponentProps<typeof AntInput> {}

export const Input: React.FC<InputProps> = (props) => {
  return <AntInput {...props} />;
};

Input.displayName = 'Input';

// TextArea 是静态属性
export const TextArea = AntInput.TextArea;

export default Input;
