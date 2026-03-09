import React from 'react';
import { Switch as AntSwitch } from 'antd';

/**
 * 开关组件
 */
export type SwitchProps = React.ComponentProps<typeof AntSwitch>;

export const Switch: React.FC<SwitchProps> = (props) => {
  return <AntSwitch {...props} />;
};

Switch.displayName = 'Switch';

export default Switch;
