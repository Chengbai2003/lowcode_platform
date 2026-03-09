import type { ComponentPanelConfig } from '../../types';

export const TableMeta: ComponentPanelConfig = {
  componentType: 'Table',
  displayName: '表格',
  category: 'display',
  icon: 'table',
  properties: [
    {
      key: 'columns',
      label: '列配置',
      editor: 'json',
      defaultValue: [{ title: '列1', dataIndex: 'col1', key: 'col1' }],
    },
    {
      key: 'dataSource',
      label: '数据源',
      editor: 'json',
      defaultValue: [{ key: '1', col1: '内容1' }],
    },
    {
      key: 'rowKey',
      label: '行主键',
      editor: 'string',
      defaultValue: 'key',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'middle',
      options: [
        { label: '默认', value: 'middle' },
        { label: '小', value: 'small' },
        { label: '大', value: 'large' },
      ],
      group: '样式',
    },
    {
      key: 'bordered',
      label: '边框',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    {
      key: 'pagination',
      label: '分页配置',
      editor: 'json',
      defaultValue: { pageSize: 10, showSizeChanger: true },
      group: '高级',
    },
    {
      key: 'scroll',
      label: '滚动配置',
      editor: 'json',
      defaultValue: {},
      group: '高级',
    },
    {
      key: 'loading',
      label: '加载中',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
  ],
};
