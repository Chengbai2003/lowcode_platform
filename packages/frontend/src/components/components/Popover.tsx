import React from 'react';
import { Popover as AntPopover } from 'antd';

/**
 * 气泡卡片组件
 */
export type PopoverProps = React.ComponentProps<typeof AntPopover>;

export const Popover: React.FC<PopoverProps> = (props) => {
  return <AntPopover {...props} />;
};

Popover.displayName = 'Popover';

export default Popover;
