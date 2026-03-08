import React from 'react';
import { Badge as AntBadge } from 'antd';

/**
 * 徽标数组件
 */
export type BadgeProps = React.ComponentProps<typeof AntBadge>;

export const Badge: React.FC<BadgeProps> = (props) => {
  return <AntBadge {...props} />;
};

Badge.displayName = 'Badge';

export default Badge;
