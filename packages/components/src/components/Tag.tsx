import React from 'react';
import { Tag as AntTag } from 'antd';

/**
 * 标签组件
 */
export interface TagProps extends React.ComponentProps<typeof AntTag> {}

export const Tag: React.FC<TagProps> = (props) => {
  return <AntTag {...props} />;
};

Tag.displayName = 'Tag';

export default Tag;
