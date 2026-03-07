import React from 'react';
import { Row as AntRow, Col as AntCol } from 'antd';

/**
 * 栅格行组件
 */
export interface RowProps extends React.ComponentProps<typeof AntRow> {}

export const Row: React.FC<RowProps> = ({ gutter = 16, ...props }) => {
  return <AntRow gutter={gutter} {...props} />;
};

Row.displayName = 'Row';

/**
 * 栅格列组件
 */
export interface ColProps extends React.ComponentProps<typeof AntCol> {}

export const Col: React.FC<ColProps> = (props) => {
  return <AntCol {...props} />;
};

Col.displayName = 'Col';

export default { Row, Col };
