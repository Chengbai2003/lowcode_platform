import React from 'react';
import { Select as AntSelect } from 'antd';

/**
 * 选择器组件
 */
export interface SelectProps extends React.ComponentProps<typeof AntSelect> {}

export const Select: React.FC<SelectProps> = (props) => {
  return <AntSelect {...props} />;
};

Select.displayName = 'Select';

export default Select;
