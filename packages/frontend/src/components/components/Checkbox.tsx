import React from 'react';
import { Checkbox as AntCheckbox } from 'antd';

/**
 * 复选框组件
 */
export interface CheckboxProps extends React.ComponentProps<typeof AntCheckbox> {}

export const Checkbox: React.FC<CheckboxProps> = (props) => {
  return <AntCheckbox {...props} />;
};

Checkbox.displayName = 'Checkbox';

export const CheckboxGroup = AntCheckbox.Group;

export default Checkbox;
