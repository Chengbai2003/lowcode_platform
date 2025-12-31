import React from 'react';
import { Steps as AntSteps } from 'antd';

/**
 * 步骤条组件
 */
export interface StepsProps extends React.ComponentProps<typeof AntSteps> {}

export const Steps: React.FC<StepsProps> = ({ current = 0, ...props }) => {
  return <AntSteps current={current} {...props} />;
};

Steps.displayName = 'Steps';

export const Step: any = AntSteps.Step;

export default Steps;
