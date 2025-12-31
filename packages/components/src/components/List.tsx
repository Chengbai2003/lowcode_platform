import React from 'react';
import { List as AntList } from 'antd';

/**
 * 列表组件
 */
export interface ListProps extends React.ComponentProps<typeof AntList> {}

export const List: React.FC<ListProps> = (props) => {
  return <AntList {...props} />;
};

List.displayName = 'List';

export const ListItem = AntList.Item;

export default List;
