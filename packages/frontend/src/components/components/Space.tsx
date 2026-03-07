import React from 'react';
import { Space as AntSpace } from 'antd';

/**
 * 间距组件
 */
export interface SpaceProps extends React.ComponentProps<typeof AntSpace> {}

export const Space: React.FC<SpaceProps> = ({ size = 'middle', ...props }) => {
  return <AntSpace size={size} {...props} />;
};

Space.displayName = 'Space';

export default Space;
