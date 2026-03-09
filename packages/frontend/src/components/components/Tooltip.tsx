import React from 'react';
import { Tooltip as AntTooltip } from 'antd';

/**
 * 文字提示组件
 */
export type TooltipProps = React.ComponentProps<typeof AntTooltip>;

export const Tooltip: React.FC<TooltipProps> = (props) => {
  return <AntTooltip {...props} />;
};

Tooltip.displayName = 'Tooltip';

export default Tooltip;
