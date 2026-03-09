import type { ComponentPanelConfig } from '../../types';

export const TableMeta: ComponentPanelConfig = {
  componentType: 'Table',
  displayName: '表格',
  category: 'display',
  icon: 'table',
  properties: [
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
      group: '高级',
    },
    {
      key: 'showQuickJumper',
      label: '快速跳转分页',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'showSizeChanger',
      label: '显示每页条数',
      editor: 'boolean',
      defaultValue: false,
      group: '高级',
    },
    {
      key: 'striped',
      label: '斑马纹',
      editor: 'boolean',
      defaultValue: false,
      group: '样式',
    },
    {
      key: 'pagination',
      label: '分页',
      editor: 'boolean',
      defaultValue: true,
      group: '高级',
    },
  ],
};
