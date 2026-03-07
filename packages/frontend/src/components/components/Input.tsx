import React from 'react';
import { Input as AntInput } from 'antd';

/**
 * 输入框组件
 */
export interface InputProps extends React.ComponentProps<typeof AntInput> {}

export const Input: React.FC<InputProps> = (props) => {
  if (props.type === 'password') {
    const { type, ...restProps } = props;
    return <AntInput.Password {...restProps} />;
  }
  if (props.type === 'textArea') {
    const { type, ...restProps } = props;
    return <AntInput.TextArea {...restProps as any} />
  }
  if (props.type === 'search') {
    const { type, ...restProps } = props;
    return <AntInput.Search {...restProps} />;
  }
  return <AntInput {...props} />;
};

Input.displayName = 'Input';

// TextArea 是静态属性
export const TextArea = AntInput.TextArea;

// Password 组件
export const Password = AntInput.Password;

export default Input;
