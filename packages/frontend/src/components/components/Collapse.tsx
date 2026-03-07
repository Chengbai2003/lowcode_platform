import React from 'react';
import { Collapse as AntCollapse } from 'antd';

/**
 * 折叠面板组件
 */
export interface CollapseProps extends React.ComponentProps<typeof AntCollapse> {}

export const Collapse: React.FC<CollapseProps> = (props) => {
  return <AntCollapse {...props} />;
};

Collapse.displayName = 'Collapse';

export const CollapsePanel = AntCollapse.Panel;

export default Collapse;
