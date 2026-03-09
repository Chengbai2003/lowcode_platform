import type { ComponentPanelConfig } from '../../types';

export const TabsMeta: ComponentPanelConfig = {
  componentType: 'Tabs',
  displayName: '标签页',
  category: 'display',
  icon: 'layers',
  properties: [
    {
      key: 'activeKey',
      label: '当前激活标签',
      editor: 'string',
      defaultValue: undefined,
      group: '高级',
    },
    {
      key: 'type',
      label: '类型',
      editor: 'select',
      defaultValue: 'line',
      options: [
        { label: '线框', value: 'line' },
        { label: '卡片', value: 'card' },
        { label: '可关闭卡片', value: 'editable-card' },
      ],
      group: '样式',
    },
    {
      key: 'tabPosition',
      label: '标签位置',
      editor: 'select',
      defaultValue: 'top',
      options: [
        { label: '上', value: 'top' },
        { label: '下', value: 'bottom' },
        { label: '左', value: 'left' },
        { label: '右', value: 'right' },
      ],
      group: '样式',
    },
    {
      key: 'size',
      label: '尺寸',
      editor: 'select',
      defaultValue: 'middle',
      options: [
        { label: '默认', value: 'default' },
        { label: '小', value: 'small' },
        { label: '大', value: 'large' },
      ],
      group: '样式',
    },
  ],
};
