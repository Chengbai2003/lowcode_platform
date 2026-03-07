import React from 'react';
import { InputNumber as AntInputNumber } from 'antd';

/**
 * 数字输入框组件
 */
export interface InputNumberProps extends React.ComponentProps<typeof AntInputNumber> {}

export const InputNumber: React.FC<InputNumberProps> = (props) => {
  return <AntInputNumber {...props} />;
};

InputNumber.displayName = 'InputNumber';

export default InputNumber;
