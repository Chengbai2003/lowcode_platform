import React from 'react';
import { Tabs as AntTabs } from 'antd';

/**
 * 标签页组件
 */
export interface TabsProps extends React.ComponentProps<typeof AntTabs> {}

export const Tabs: React.FC<TabsProps> = ({ type = 'line', ...props }) => {
  return <AntTabs type={type} {...props} />;
};

Tabs.displayName = 'Tabs';

export const TabPane = AntTabs.TabPane;

export default Tabs;
