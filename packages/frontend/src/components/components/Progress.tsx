import React from 'react';
import { Progress as AntProgress } from 'antd';

/**
 * 进度条组件
 */
export interface ProgressProps extends React.ComponentProps<typeof AntProgress> {}

export const Progress: React.FC<ProgressProps> = ({ percent = 0, ...props }) => {
  return <AntProgress percent={percent} {...props} />;
};

Progress.displayName = 'Progress';

export default Progress;
