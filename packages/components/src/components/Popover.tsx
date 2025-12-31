import React from 'react';
import { Popover as AntPopover } from 'antd';

/**
 * 气泡卡片组件
 */
export interface PopoverProps extends React.ComponentProps<typeof AntPopover> {}

export const Popover: React.FC<PopoverProps> = (props) => {
  return <AntPopover {...props} />;
};

Popover.displayName = 'Popover';

export default Popover;
