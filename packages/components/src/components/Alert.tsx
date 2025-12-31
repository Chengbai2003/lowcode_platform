import React from 'react';
import { Alert as AntAlert } from 'antd';

/**
 * 警告提示组件
 */
export interface AlertProps extends React.ComponentProps<typeof AntAlert> {}

export const Alert: React.FC<AlertProps> = (props) => {
  return <AntAlert {...props} />;
};

Alert.displayName = 'Alert';

export default Alert;
