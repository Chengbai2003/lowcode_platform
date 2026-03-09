import React from 'react';
import { Spin as AntSpin } from 'antd';

/**
 * 加载中组件
 */
export type SpinProps = React.ComponentProps<typeof AntSpin>;

export const Spin: React.FC<SpinProps> = (props) => {
  return <AntSpin {...props} />;
};

Spin.displayName = 'Spin';

export default Spin;
