import React from 'react';
import { Divider as AntDivider } from 'antd';

/**
 * 分割线组件
 */
export type DividerProps = React.ComponentProps<typeof AntDivider>;

export const Divider: React.FC<DividerProps> = (props) => {
  return <AntDivider {...props} />;
};

Divider.displayName = 'Divider';

export default Divider;
