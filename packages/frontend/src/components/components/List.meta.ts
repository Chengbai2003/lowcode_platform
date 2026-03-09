import type { ComponentPanelConfig } from '../../types';

export const ListMeta: ComponentPanelConfig = {
  componentType: 'List',
  displayName: '列表',
  category: 'display',
  icon: 'list',
  properties: [
    { key: 'header', label: '头部内容', editor: 'string', defaultValue: '' },
    { key: 'footer', label: '底部内容', editor: 'string', defaultValue: '' },
    { key: 'bordered', label: '显示边框', editor: 'boolean', defaultValue: false, group: '样式' },
    { key: 'split', label: '显示分割线', editor: 'boolean', defaultValue: true, group: '样式' },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'default',
      options: [
        { label: '默认', value: 'default' },
        { label: '小', value: 'small' },
        { label: '大', value: 'large' },
      ],
      group: '样式',
    },
    { key: 'dataSource', label: '数据源', editor: 'json', defaultValue: [], group: '高级' },
  ],
};
