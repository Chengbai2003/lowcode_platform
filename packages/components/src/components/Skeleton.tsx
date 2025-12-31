import React from 'react';
import { Skeleton as AntSkeleton } from 'antd';

/**
 * 骨架屏组件
 */
export interface SkeletonProps extends React.ComponentProps<typeof AntSkeleton> {}

export const Skeleton: React.FC<SkeletonProps> = (props) => {
  return <AntSkeleton {...props} />;
};

Skeleton.displayName = 'Skeleton';

export default Skeleton;
