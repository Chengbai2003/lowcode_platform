import React from 'react';
import { Table as AntTable } from 'antd';

/**
 * 表格组件
 */
export interface TableProps extends React.ComponentProps<typeof AntTable> {}

export const Table: React.FC<TableProps> = (props) => {
  return <AntTable {...props} />;
};

Table.displayName = 'Table';

export default Table;
